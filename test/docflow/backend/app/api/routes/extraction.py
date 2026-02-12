import os
import json
import io
import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from celery.result import AsyncResult

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.core.celery_app import celery_app
from app.services import ocr_service
from app.services.semantic_index_service import semantic_index_service
from app.crud import processing_run as run_crud
from app.crud import document_type as document_type_crud
from app.schemas.extraction import (
    ExtractionResponse, HealthCheckResponse,
    DocumentQueryRequest, DocumentQueryResponse,
    QueryHistoryItem, QueryHistoryResponse,
)
from app.crud import document_query as query_crud
from app.schemas.processing_run import ProcessingSource
from app.models.processed_document import DocumentStatus
from app.models.processing_run import ProcessingStatus
from app.models.user import UserRole
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service
from app.tasks.document_tasks import process_document_task

router = APIRouter(tags=["extraction"])

UPLOAD_FOLDER = tempfile.mkdtemp()


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in settings.ALLOWED_EXTENSIONS


def _save_preview_image(result: dict, storage_prefix: str, original_name: str) -> str | None:
    """Save first page image as preview and return object key."""
    page_images = result.get("pageImages", [])
    if not page_images:
        return None
    first_page = page_images[0]
    if not os.path.exists(first_page) or first_page.endswith('.txt'):
        return None
    preview_filename = f"{original_name}_preview.png"
    preview_key = storage_service.build_key(storage_prefix, preview_filename)
    storage_service.save_file(first_page, preview_key, content_type="image/png")
    return preview_key


def _cleanup_ocr_temp(result: dict):
    """Cleanup temp directory created by OCR for PDF/Word conversion."""
    temp_dir = result.get("_temp_dir")
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)


async def _classify_document_type(text: str, db: Session) -> tuple[Optional[UUID], list]:
    items, _ = document_type_crud.get_document_types(
        db,
        skip=0,
        limit=200,
        user_id=None,
    )
    candidates = items
    if not candidates:
        return None, []

    payload = [
        {
            "id": str(item.id),
            "name": item.name,
            "description": item.description or "",
            "fields": item.fields or [],
            "export_keys": item.export_keys or {},
        }
        for item in candidates
    ]

    doc_type_id = await llm_service.classify_document_type(text, payload)
    if doc_type_id:
        return UUID(doc_type_id), candidates
    if len(candidates) == 1:
        return candidates[0].id, candidates
    return None, candidates


@router.get("/health", response_model=HealthCheckResponse)
def health_check():
    return HealthCheckResponse(
        status="ok",
        message="Document Extraction API is running",
        api_configured=ocr_service.is_paddle_initialized(),
    )


@router.post("/extract", response_model=ExtractionResponse)
async def extract_document(
    file: UploadFile = File(...),
    fields: str = Form(default="[]"),
):
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        fields_to_extract = json.loads(fields) if fields else []
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        try:
            if not ocr_service.is_paddle_initialized():
                raise HTTPException(status_code=500, detail="OCR engine is not initialized")

            result = ocr_service.extract_document(filepath, fields_to_extract)

            return ExtractionResponse(
                fields=result.get("fields", []),
                raw_text=result.get("rawText", ""),
                raw_text_raw=result.get("rawTextRaw", ""),
                json_content=result.get("jsonContent", {}),
                success=True,
            )
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid fields JSON")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/document-type/{document_type_id}/extract")
async def extract_and_save(
    document_type_id: UUID,
    file: UploadFile = File(...),
    fields: str = Form(default="[]"),
    source: ProcessingSource = ProcessingSource.MANUAL,
    trigger_name: Optional[str] = None,
    processing_run_id: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        document_type = document_type_crud.get_document_type(db, document_type_id)
        if not document_type:
            raise HTTPException(status_code=404, detail="Document type not found")
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        fields_to_extract = json.loads(fields) if fields and fields != "[]" else document_type.fields

        file_content = await file.read()
        file_size = len(file_content)

        temp_filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(temp_filepath, "wb") as buffer:
            buffer.write(file_content)

        try:
            if processing_run_id:
                processing_run = run_crud.get_processing_run(db, UUID(processing_run_id))
                if not processing_run:
                    raise HTTPException(status_code=404, detail="Processing run not found")
                if current_user.role != UserRole.ADMIN and processing_run.user_id != current_user.id:
                    raise HTTPException(status_code=403, detail="Access denied")
            else:
                processing_run = run_crud.create_processing_run(
                    db, document_type_id, source, trigger_name, user_id=current_user.id
                )

            original_name = Path(file.filename).stem
            storage_prefix = storage_service.build_key(str(document_type_id), str(processing_run.id))
            storage_key = storage_service.find_available_key([storage_prefix], file.filename)
            storage_service.save_file(temp_filepath, storage_key, content_type=file.content_type)

            document = run_crud.create_processed_document(
                db,
                processing_run.id,
                filename=file.filename,
                file_path=storage_key,
                file_size=file_size,
                mime_type=file.content_type,
            )

            if not ocr_service.is_paddle_initialized():
                run_crud.update_processing_run_status(db, processing_run.id, ProcessingStatus.ERROR)
                run_crud.update_document_status(db, document.id, DocumentStatus.ERROR)
                raise HTTPException(status_code=500, detail="OCR engine is not initialized")

            result = ocr_service.extract_document(temp_filepath, fields_to_extract, document_type_id=str(document_type_id))

            try:
                # Save preview image for PDF/Word documents
                preview_path = _save_preview_image(result, storage_prefix, original_name)

                extracted_fields = [
                    {
                        "name": f["name"],
                        "value": f["value"],
                        "confidence": f.get("confidence", 0.0),
                        "coordinate": f.get("coordinate"),
                        "group": f.get("group"),
                        "row_index": f.get("row_index"),
                        "original_value": f["value"],
                        "is_corrected": False,
                    }
                    for f in result.get("fields", [])
                ]

                ocr_result = {
                    "raw_text": result.get("rawText", ""),
                    "raw_text_raw": result.get("rawTextRaw", ""),
                    "json_content": result.get("jsonContent", {}),
                    "highlighted_image": None,
                    "preview_image": preview_path,
                }

                run_crud.update_document_extraction_results(
                    db,
                    document.id,
                    ocr_result=ocr_result,
                    extracted_fields=extracted_fields,
                    status=DocumentStatus.NEEDS_REVIEW,
                )

                raw_text = result.get("rawText", "")
                if raw_text:
                    try:
                        semantic_index_service.add_document(
                            document_id=document.id,
                            text=raw_text,
                            metadata={
                                "filename": document.filename,
                                "document_type_id": str(document_type_id),
                                "document_type_name": document_type.name,
                                "run_id": str(processing_run.id),
                                "user_id": str(current_user.id),
                                "status": document.status.value,
                                "created_at": document.created_at.isoformat() if document.created_at else "",
                            },
                        )
                    except Exception as e:
                        print(f"Failed to index document {document.id} in semantic index: {e}")

                run_crud.update_processing_run_status(db, processing_run.id, ProcessingStatus.NEEDS_REVIEW)
                db.refresh(processing_run)

                return {
                    "success": True,
                    "processing_run_id": str(processing_run.id),
                    "document_id": str(document.id),
                    "document_type_id": str(document_type_id),
                    "document_type_name": document_type.name,
                    "fields_extracted": len(result.get("fields", [])),
                    "status": processing_run.status.value,
                }
            finally:
                _cleanup_ocr_temp(result)

        finally:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid fields JSON")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-json")
async def extract_document_json(
    file: UploadFile = File(...),
    fields: str = Form(default="[]"),
):
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        fields_to_extract = json.loads(fields) if fields else []
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        try:
            if not ocr_service.is_paddle_initialized():
                raise HTTPException(status_code=500, detail="OCR engine is not initialized")

            result = ocr_service.extract_document(filepath, fields_to_extract)

            return {
                "fields": result.get("fields", []),
                "jsonContent": result.get("jsonContent", {}),
                "success": True,
            }
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-auto")
async def extract_and_save_auto(
    file: UploadFile = File(...),
    source: ProcessingSource = ProcessingSource.MANUAL,
    trigger_name: Optional[str] = None,
    processing_run_id: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        file_content = await file.read()
        file_size = len(file_content)

        temp_filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(temp_filepath, "wb") as buffer:
            buffer.write(file_content)

        try:
            if not ocr_service.is_paddle_initialized():
                raise HTTPException(status_code=500, detail="OCR not initialized")

            # OCR first, without extraction
            result = ocr_service.extract_document(temp_filepath, [], document_type_id=None)

            try:
                text_for_classification = result.get("rawText") or result.get("rawTextRaw") or ""

                if processing_run_id:
                    processing_run = run_crud.get_processing_run(db, UUID(processing_run_id))
                    if not processing_run:
                        raise HTTPException(status_code=404, detail="Processing run not found")
                    if current_user.role != UserRole.ADMIN and processing_run.user_id != current_user.id:
                        raise HTTPException(status_code=403, detail="Access denied")
                    document_type_id = processing_run.document_type_id
                else:
                    document_type_id, candidates = await _classify_document_type(text_for_classification, db)
                    if not document_type_id:
                        raise HTTPException(status_code=422, detail="Unable to classify document")

                    processing_run = run_crud.create_processing_run(
                        db, document_type_id, source, trigger_name, user_id=current_user.id
                    )

                document_type = document_type_crud.get_document_type(db, document_type_id)
                if not document_type:
                    raise HTTPException(status_code=404, detail="Document type not found")

                original_name = Path(file.filename).stem
                storage_prefix = storage_service.build_key(str(document_type_id), str(processing_run.id))
                storage_key = storage_service.find_available_key([storage_prefix], file.filename)
                storage_service.save_file(temp_filepath, storage_key, content_type=file.content_type)

                # Save preview image for PDF/Word documents
                preview_path = _save_preview_image(result, storage_prefix, original_name)

                document = run_crud.create_processed_document(
                    db,
                    processing_run.id,
                    filename=file.filename,
                    file_path=storage_key,
                    file_size=file_size,
                    mime_type=file.content_type,
                )

                fields_to_extract = document_type.fields or []
                text_for_extraction = result.get("rawText") or result.get("rawTextRaw") or ""
                extracted_fields = []
                if fields_to_extract:
                    extracted_fields = ocr_service.extract_fields_with_llm_resilient(
                        text_for_extraction,
                        fields_to_extract,
                        result.get("jsonContent", {}),
                        document_type_id=str(document_type_id),
                    )

                extracted_fields_payload = [
                    {
                        "name": f["name"],
                        "value": f["value"],
                        "confidence": f.get("confidence", 0.0),
                        "coordinate": f.get("coordinate"),
                        "group": f.get("group"),
                        "row_index": f.get("row_index"),
                        "original_value": f["value"],
                        "is_corrected": False,
                    }
                    for f in extracted_fields
                ]

                ocr_result = {
                    "raw_text": result.get("rawText", ""),
                    "raw_text_raw": result.get("rawTextRaw", ""),
                    "json_content": result.get("jsonContent", {}),
                    "highlighted_image": None,
                    "preview_image": preview_path,
                }

                run_crud.update_document_extraction_results(
                    db,
                    document.id,
                    ocr_result=ocr_result,
                    extracted_fields=extracted_fields_payload,
                    status=DocumentStatus.NEEDS_REVIEW,
                )

                raw_text = result.get("rawText", "")
                if raw_text:
                    try:
                        semantic_index_service.add_document(
                            document_id=document.id,
                            text=raw_text,
                            metadata={
                                "filename": document.filename,
                                "document_type_id": str(document_type_id),
                                "document_type_name": document_type.name,
                                "run_id": str(processing_run.id),
                                "user_id": str(current_user.id),
                                "status": document.status.value,
                                "created_at": document.created_at.isoformat() if document.created_at else "",
                            },
                        )
                    except Exception as e:
                        print(f"Failed to index document {document.id} in semantic index: {e}")

                run_crud.update_processing_run_status(db, processing_run.id, ProcessingStatus.NEEDS_REVIEW)
                db.refresh(processing_run)

                return {
                    "success": True,
                    "processing_run_id": str(processing_run.id),
                    "document_id": str(document.id),
                    "document_type_id": str(document_type_id),
                    "document_type_name": document_type.name,
                    "fields_extracted": len(extracted_fields_payload),
                    "status": processing_run.status.value,
                }
            finally:
                _cleanup_ocr_temp(result)

        finally:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid fields JSON")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/file")
def get_document_file(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    document = run_crud.get_processed_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role != UserRole.ADMIN and document.processing_run.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not document.file_path:
        raise HTTPException(status_code=404, detail="Document file path not found")

    try:
        file_bytes = storage_service.read_bytes(document.file_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Document file not found in storage")

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=document.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{document.filename}"'},
    )


@router.get("/documents/{document_id}/preview")
def get_document_preview(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return a preview PNG image for PDF/Word documents."""
    document = run_crud.get_processed_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role != UserRole.ADMIN and document.processing_run.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    preview_path_rel = (document.ocr_result or {}).get("preview_image")
    if not preview_path_rel:
        raise HTTPException(status_code=404, detail="Preview not available")

    try:
        preview_bytes = storage_service.read_bytes(preview_path_rel)
    except Exception:
        raise HTTPException(status_code=404, detail="Preview file not found")

    return StreamingResponse(
        io.BytesIO(preview_bytes),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{Path(document.filename).stem}_preview.png"'},
    )


@router.post("/documents/{document_id}/query", response_model=DocumentQueryResponse)
async def query_document(
    document_id: UUID,
    body: DocumentQueryRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    document = run_crud.get_processed_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role != UserRole.ADMIN and document.processing_run.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not llm_service.is_configured:
        raise HTTPException(status_code=503, detail="LLM service not configured")

    raw_text = (document.ocr_result or {}).get("raw_text", "")
    if not raw_text:
        raise HTTPException(status_code=400, detail="Document has no extracted text")

    extracted_fields = document.extracted_fields or []

    try:
        answer = await llm_service.query_document(
            query=body.query,
            raw_text=raw_text,
            extracted_fields=extracted_fields,
        )
        query_crud.create_query(
            db,
            document_id=document_id,
            user_id=current_user.id,
            question=body.query,
            answer=answer,
        )
        return DocumentQueryResponse(
            answer=answer,
            document_id=str(document_id),
        )
    except HTTPException:
        raise
    except Exception as e:
        query_crud.create_query(
            db,
            document_id=document_id,
            user_id=current_user.id,
            question=body.query,
            answer="",
            error=str(e)[:500],
        )
        raise HTTPException(status_code=500, detail=f"LLM query failed: {str(e)}")


@router.get("/documents/{document_id}/query-history", response_model=QueryHistoryResponse)
def get_query_history(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    document = run_crud.get_processed_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role != UserRole.ADMIN and document.processing_run.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    queries = query_crud.get_queries_by_document(db, document_id, current_user.id)
    return QueryHistoryResponse(
        document_id=str(document_id),
        items=[
            QueryHistoryItem(
                id=str(q.id),
                question=q.question,
                answer=q.answer,
                error=q.error,
                created_at=q.created_at,
            )
            for q in queries
        ],
    )


@router.delete("/documents/{document_id}/query-history")
def clear_query_history(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    document = run_crud.get_processed_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role != UserRole.ADMIN and document.processing_run.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    deleted = query_crud.delete_queries_by_document(db, document_id, current_user.id)
    return {"deleted": deleted}


@router.post("/document-type/{document_type_id}/extract-async")
async def extract_and_save_async(
    document_type_id: UUID,
    file: UploadFile = File(...),
    fields: str = Form(default="[]"),
    source: ProcessingSource = ProcessingSource.MANUAL,
    trigger_name: Optional[str] = None,
    processing_run_id: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        document_type = document_type_crud.get_document_type(db, document_type_id)
        if not document_type:
            raise HTTPException(status_code=404, detail="Document type not found")

        if not file:
            raise HTTPException(status_code=400, detail="No file provided")

        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        fields_to_extract = json.loads(fields) if fields and fields != "[]" else document_type.fields

        file_content = await file.read()
        file_size = len(file_content)

        temp_dir = Path(UPLOAD_FOLDER) / str(current_user.id)
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_filepath = str(temp_dir / file.filename)

        with open(temp_filepath, "wb") as buffer:
            buffer.write(file_content)

        if processing_run_id:
            processing_run = run_crud.get_processing_run(db, UUID(processing_run_id))
            if not processing_run:
                raise HTTPException(status_code=404, detail="Processing run not found")
            if current_user.role != UserRole.ADMIN and processing_run.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            processing_run = run_crud.create_processing_run(
                db, document_type_id, source, trigger_name, user_id=current_user.id
            )

        storage_prefix = storage_service.build_key(str(document_type_id), str(processing_run.id))
        storage_key = storage_service.find_available_key([storage_prefix], file.filename)
        storage_service.save_file(temp_filepath, storage_key, content_type=file.content_type)

        document = run_crud.create_processed_document(
            db,
            processing_run.id,
            filename=file.filename,
            file_path=storage_key,
            file_size=file_size,
            mime_type=file.content_type,
            status=DocumentStatus.PROCESSING,
        )

        task = process_document_task.delay(
            document_id=str(document.id),
            processing_run_id=str(processing_run.id),
            document_type_id=str(document_type_id),
            temp_filepath=temp_filepath,
            original_filename=file.filename,
            file_size=file_size,
            mime_type=file.content_type,
            fields_to_extract=fields_to_extract,
            user_id=str(current_user.id),
        )

        return {
            "success": True,
            "async": True,
            "task_id": task.id,
            "processing_run_id": str(processing_run.id),
            "document_id": str(document.id),
            "status": "processing",
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid fields JSON")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}/status")
def get_task_status(
    task_id: str,
    current_user=Depends(get_current_user),
):
    result = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "status": result.status,
        "ready": result.ready(),
    }

    if result.ready():
        if result.successful():
            response["result"] = result.result
        elif result.failed():
            response["error"] = str(result.result)

    return response


@router.get("/tasks/pending")
def get_pending_tasks(
    limit: int = Query(default=10, le=100),
    current_user=Depends(get_current_user),
):
    inspect = celery_app.control.inspect()

    active = inspect.active() or {}
    reserved = inspect.reserved() or {}

    tasks = []

    for worker, worker_tasks in active.items():
        for task in worker_tasks:
            tasks.append({
                "task_id": task.get("id"),
                "name": task.get("name"),
                "status": "active",
                "worker": worker,
            })

    for worker, worker_tasks in reserved.items():
        for task in worker_tasks:
            tasks.append({
                "task_id": task.get("id"),
                "name": task.get("name"),
                "status": "reserved",
                "worker": worker,
            })

    return {"tasks": tasks[:limit], "total": len(tasks)}
