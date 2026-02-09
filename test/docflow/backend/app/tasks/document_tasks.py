"""
Celery tasks for document processing
"""
import os
import shutil
from pathlib import Path
from uuid import UUID
from typing import Optional

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services import ocr_service
from app.services.vectorstore_service import vectorstore_service
from app.services.storage_service import storage_service
from app.crud import processing_run as run_crud
from app.crud import document_type as document_type_crud
from app.models.processed_document import DocumentStatus
from app.models.processing_run import ProcessingStatus


@celery_app.task(bind=True, max_retries=3)
def process_document_task(
    self,
    document_id: str,
    processing_run_id: str,
    document_type_id: str,
    temp_filepath: str,
    original_filename: str,
    file_size: int,
    mime_type: Optional[str],
    fields_to_extract: list[str],
    user_id: str,
):
    db = SessionLocal()

    try:
        doc_uuid = UUID(document_id)
        run_uuid = UUID(processing_run_id)
        doc_type_uuid = UUID(document_type_id)

        document_type = document_type_crud.get_document_type(db, doc_type_uuid)
        if not document_type:
            raise ValueError(f"Document type {document_type_id} not found")

        run_crud.update_document_status(db, doc_uuid, DocumentStatus.PROCESSING)

        if not ocr_service.is_paddle_initialized():
            run_crud.update_document_status(db, doc_uuid, DocumentStatus.ERROR)
            run_crud.update_processing_run_status(db, run_uuid, ProcessingStatus.ERROR)
            raise RuntimeError("PaddleOCR not initialized")

        result = ocr_service.extract_document(temp_filepath, fields_to_extract, document_type_id=document_type_id)

        try:
            # Save preview image for PDF/Word documents
            preview_path = None
            page_images = result.get("pageImages", [])
            if page_images:
                document = run_crud.get_processed_document(db, doc_uuid)
                if document and document.file_path:
                    first_page = page_images[0]
                    if os.path.exists(first_page) and not first_page.endswith('.txt'):
                        original_stem = Path(original_filename).stem
                        storage_prefix = document.file_path.rsplit("/", 1)[0] if "/" in document.file_path else ""
                        preview_key = storage_service.build_key(storage_prefix, f"{original_stem}_preview.png")
                        storage_service.save_file(first_page, preview_key, content_type="image/png")
                        preview_path = preview_key
        finally:
            # Cleanup temp dir from OCR
            temp_dir = result.get("_temp_dir")
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)

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
            "preview_image": preview_path,
        }

        run_crud.update_document_extraction_results(
            db,
            doc_uuid,
            ocr_result=ocr_result,
            extracted_fields=extracted_fields,
            status=DocumentStatus.NEEDS_REVIEW,
        )

        raw_text = result.get("rawText", "")
        if raw_text:
            try:
                document = run_crud.get_processed_document(db, doc_uuid)
                vectorstore_service.add_document(
                    document_id=doc_uuid,
                    text=raw_text,
                    metadata={
                        "filename": original_filename,
                        "document_type_id": document_type_id,
                        "document_type_name": document_type.name,
                        "run_id": processing_run_id,
                        "user_id": user_id,
                        "status": DocumentStatus.NEEDS_REVIEW.value,
                        "created_at": document.created_at.isoformat() if document and document.created_at else "",
                    },
                )
            except Exception as e:
                print(f"Failed to index document {document_id} in vectorstore: {e}")

        run_crud.update_processing_run_status(db, run_uuid, ProcessingStatus.NEEDS_REVIEW)

        return {
            "success": True,
            "document_id": document_id,
            "fields_extracted": len(result.get("fields", [])),
        }

    except Exception as exc:
        try:
            run_crud.update_document_status(db, UUID(document_id), DocumentStatus.ERROR)
            run_crud.update_processing_run_status(db, UUID(processing_run_id), ProcessingStatus.ERROR)
        except Exception:
            pass

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        raise

    finally:
        db.close()
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except Exception:
                pass


@celery_app.task(bind=True, max_retries=3)
def batch_process_documents_task(
    self,
    document_type_id: str,
    processing_run_id: str,
    documents: list[dict],
    user_id: str,
):
    db = SessionLocal()

    try:
        doc_type_uuid = UUID(document_type_id)
        document_type = document_type_crud.get_document_type(db, doc_type_uuid)
        if not document_type:
            raise ValueError(f"Document type {document_type_id} not found")

        fields_to_extract = document_type.fields or []

        results = []
        for doc_info in documents:
            task = process_document_task.delay(
                document_id=doc_info["document_id"],
                processing_run_id=processing_run_id,
                document_type_id=document_type_id,
                temp_filepath=doc_info["temp_filepath"],
                original_filename=doc_info["original_filename"],
                file_size=doc_info["file_size"],
                mime_type=doc_info.get("mime_type"),
                fields_to_extract=fields_to_extract,
                user_id=user_id,
            )
            results.append({
                "document_id": doc_info["document_id"],
                "task_id": task.id,
            })

        return {
            "success": True,
            "processing_run_id": processing_run_id,
            "documents_queued": len(results),
            "tasks": results,
        }

    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60)
        raise

    finally:
        db.close()


@celery_app.task
def cleanup_temp_files_task(file_paths: list[str]):
    for path in file_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                print(f"Failed to remove temp file {path}: {e}")
