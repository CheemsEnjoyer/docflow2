"""
Service for folder-based triggers.
Scans configured folders for new files and processes them via OCR + auto-classification.
"""
import os
import shutil
import tempfile
from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.trigger import Trigger
from app.services import ocr_service
from app.services.llm_service import llm_service
from app.services.semantic_index_service import semantic_index_service
from app.services.storage_service import storage_service
from app.crud import processing_run as run_crud
from app.crud import document_type as document_type_crud
from app.models.processed_document import DocumentStatus
from app.models.processing_run import ProcessingStatus
from app.schemas.processing_run import ProcessingSource

ALLOWED_EXTENSIONS = settings.ALLOWED_EXTENSIONS


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _classify_document_type_sync(text: str, db):
    """Classify document type using LLM (sync wrapper)."""
    import asyncio

    items, _ = document_type_crud.get_document_types(db, skip=0, limit=200, user_id=None)
    if not items:
        return None, []

    payload = [
        {
            "id": str(item.id),
            "name": item.name,
            "description": item.description or "",
            "fields": item.fields or [],
            "export_keys": item.export_keys or {},
        }
        for item in items
    ]

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    llm_service.classify_document_type(text, payload),
                )
                doc_type_id = future.result()
        else:
            doc_type_id = loop.run_until_complete(
                llm_service.classify_document_type(text, payload)
            )
    except Exception as e:
        print(f"[FolderTrigger] Classification failed: {e}")
        doc_type_id = None

    if doc_type_id:
        return UUID(doc_type_id), items
    if len(items) == 1:
        return items[0].id, items
    return None, items


def _process_file(filepath: str, filename: str, trigger: Trigger, db):
    """Process a single file: OCR → classify → extract fields → save."""
    print(f"[FolderTrigger] Processing: {filename}")

    if not ocr_service.is_ocr_initialized():
        print("[FolderTrigger] OCR not initialized, skipping")
        return

    # Step 1: OCR without field extraction
    result = ocr_service.extract_document(filepath, [], document_type_id=None)

    try:
        text = result.get("rawText") or result.get("rawTextRaw") or ""
        if not text.strip():
            print(f"[FolderTrigger] No text extracted from {filename}, skipping")
            return

        # Step 2: Classify document type
        document_type_id, candidates = _classify_document_type_sync(text, db)
        if not document_type_id:
            print(f"[FolderTrigger] Could not classify {filename}, skipping")
            return

        document_type = document_type_crud.get_document_type(db, document_type_id)
        if not document_type:
            print(f"[FolderTrigger] Document type {document_type_id} not found")
            return

        # Step 3: Create processing run
        trigger_name = Path(trigger.folder or "").name or "Триггер"
        processing_run = run_crud.create_processing_run(
            db,
            document_type_id,
            ProcessingSource.TRIGGER,
            trigger_name,
            user_id=trigger.user_id,
        )

        # Step 4: Save file to storage
        original_name = Path(filename).stem
        storage_prefix = storage_service.build_key(str(document_type_id), str(processing_run.id))
        storage_key = storage_service.find_available_key([storage_prefix], filename)
        storage_service.save_file(filepath, storage_key, content_type=None)

        # Save preview image
        preview_path = None
        page_images = result.get("pageImages", [])
        if page_images:
            first_page = page_images[0]
            if os.path.exists(first_page) and not first_page.endswith(".txt"):
                preview_key = storage_service.build_key(storage_prefix, f"{original_name}_preview.png")
                storage_service.save_file(first_page, preview_key, content_type="image/png")
                preview_path = preview_key

        file_size = os.path.getsize(filepath)
        document = run_crud.create_processed_document(
            db,
            processing_run.id,
            filename=filename,
            file_path=storage_key,
            file_size=file_size,
            mime_type=None,
        )

        # Step 5: Extract fields
        fields_to_extract = document_type.fields or []
        extracted_fields = []
        if fields_to_extract:
            extracted_fields = ocr_service.extract_fields_with_llm_resilient(
                text,
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

        # Step 6: Index in vector store
        raw_text = result.get("rawText", "")
        if raw_text:
            try:
                semantic_index_service.add_document(
                    document_id=document.id,
                    text=raw_text,
                    metadata={
                        "filename": filename,
                        "document_type_id": str(document_type_id),
                        "document_type_name": document_type.name,
                        "run_id": str(processing_run.id),
                        "user_id": str(trigger.user_id),
                        "status": DocumentStatus.NEEDS_REVIEW.value,
                        "created_at": document.created_at.isoformat() if document.created_at else "",
                    },
                )
            except Exception as e:
                print(f"[FolderTrigger] Semantic indexing failed for {filename}: {e}")

        run_crud.update_processing_run_status(db, processing_run.id, ProcessingStatus.NEEDS_REVIEW)
        print(f"[FolderTrigger] Successfully processed {filename} -> {document_type.name}")

    finally:
        temp_dir = result.get("_temp_dir")
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def scan_folder_triggers():
    """
    Scan all enabled folder triggers for new files.
    Called periodically by Celery beat.
    """
    db = SessionLocal()
    try:
        triggers = db.query(Trigger).filter(
            Trigger.enabled == True,
            Trigger.folder.isnot(None),
        ).all()

        if not triggers:
            return

        for trigger in triggers:
            folder = trigger.folder
            if not folder or not os.path.isdir(folder):
                print(f"[FolderTrigger] Folder not found: {folder}")
                continue

            processed = set(trigger.processed_files or [])
            new_files = []

            for entry in os.scandir(folder):
                if not entry.is_file():
                    continue
                if not _allowed_file(entry.name):
                    continue
                if entry.name in processed:
                    continue
                new_files.append(entry.name)

            if not new_files:
                continue

            print(f"[FolderTrigger] Found {len(new_files)} new file(s) in {folder}")

            for filename in new_files:
                filepath = os.path.join(folder, filename)
                try:
                    _process_file(filepath, filename, trigger, db)
                    processed.add(filename)
                except Exception as e:
                    print(f"[FolderTrigger] Error processing {filename}: {e}")
                    import traceback
                    traceback.print_exc()
                    # Still mark as processed to avoid retrying broken files forever
                    processed.add(filename)

            # Update processed files list
            trigger.processed_files = list(processed)
            db.commit()

    except Exception as e:
        print(f"[FolderTrigger] Scan failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
