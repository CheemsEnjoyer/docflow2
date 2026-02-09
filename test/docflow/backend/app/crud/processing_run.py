from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc
from app.models.processing_run import ProcessingRun, ProcessingStatus, ProcessingSource
from app.models.document_type import DocumentType
from app.models.processed_document import ProcessedDocument, DocumentStatus


def get_processing_run(db: Session, run_id: UUID) -> Optional[ProcessingRun]:
    return (
        db.query(ProcessingRun)
        .options(selectinload(ProcessingRun.document_type))
        .filter(ProcessingRun.id == run_id)
        .first()
    )


def get_processing_runs_by_document_type(
    db: Session,
    document_type_id: UUID,
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[UUID] = None,
) -> tuple[list[ProcessingRun], int]:
    query = (
        db.query(ProcessingRun)
        .options(selectinload(ProcessingRun.document_type))
        .filter(ProcessingRun.document_type_id == document_type_id)
    )
    if user_id:
        query = query.filter(ProcessingRun.user_id == user_id)
    total = query.count()
    runs = query.order_by(desc(ProcessingRun.created_at)).offset(skip).limit(limit).all()
    return runs, total


def get_processing_runs(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[UUID] = None,
) -> tuple[list[ProcessingRun], int]:
    query = db.query(ProcessingRun).options(selectinload(ProcessingRun.document_type))
    if user_id:
        query = query.filter(ProcessingRun.user_id == user_id)
    total = query.count()
    runs = query.order_by(desc(ProcessingRun.created_at)).offset(skip).limit(limit).all()
    return runs, total


def create_processing_run(
    db: Session,
    document_type_id: UUID,
    source: ProcessingSource = ProcessingSource.MANUAL,
    trigger_name: Optional[str] = None,
    user_id: Optional[UUID] = None,
) -> ProcessingRun:
    resolved_user_id = user_id
    if resolved_user_id is None:
        document_type = db.query(DocumentType).filter(DocumentType.id == document_type_id).first()
        if not document_type:
            raise ValueError("Document type not found")
        resolved_user_id = document_type.user_id

    db_run = ProcessingRun(
        document_type_id=document_type_id,
        user_id=resolved_user_id,
        source=source,
        trigger_name=trigger_name,
        status=ProcessingStatus.PROCESSING,
    )
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run


def update_processing_run_status(
    db: Session,
    run_id: UUID,
    status: ProcessingStatus,
) -> Optional[ProcessingRun]:
    db_run = get_processing_run(db, run_id)
    if not db_run:
        return None

    db_run.status = status
    db.commit()
    db.refresh(db_run)
    return db_run


def update_processing_run_document_type(
    db: Session,
    run_id: UUID,
    document_type_id: UUID,
) -> Optional[ProcessingRun]:
    db_run = get_processing_run(db, run_id)
    if not db_run:
        return None

    db_run.document_type_id = document_type_id
    db.commit()
    db.refresh(db_run)
    db.expire(db_run, ["document_type"])
    return db_run


def delete_processing_run(db: Session, run_id: UUID) -> bool:
    db_run = get_processing_run(db, run_id)
    if not db_run:
        return False

    db.delete(db_run)
    db.commit()
    return True


def mark_run_as_reviewed(db: Session, run_id: UUID) -> Optional[ProcessingRun]:
    db_run = get_processing_run(db, run_id)
    if not db_run:
        return None

    db_run.status = ProcessingStatus.REVIEWED
    for doc in db_run.documents:
        doc.status = DocumentStatus.REVIEWED

    db.commit()
    db.refresh(db_run)
    return db_run


def cancel_run_review(db: Session, run_id: UUID) -> Optional[ProcessingRun]:
    db_run = get_processing_run(db, run_id)
    if not db_run:
        return None

    db_run.status = ProcessingStatus.NEEDS_REVIEW
    for doc in db_run.documents:
        doc.status = DocumentStatus.NEEDS_REVIEW

    db.commit()
    db.refresh(db_run)
    return db_run


def cancel_document_review(db: Session, document_id: UUID) -> Optional[ProcessedDocument]:
    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return None

    db_doc.status = DocumentStatus.NEEDS_REVIEW

    db_run = db_doc.processing_run
    if db_run:
        db_run.status = ProcessingStatus.NEEDS_REVIEW

    db.commit()
    db.refresh(db_doc)
    return db_doc


def mark_document_reviewed(db: Session, document_id: UUID) -> Optional[ProcessedDocument]:
    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return None

    db_doc.status = DocumentStatus.REVIEWED

    db_run = db_doc.processing_run
    if db_run:
        all_reviewed = all(
            doc.status == DocumentStatus.REVIEWED
            for doc in db_run.documents
        )
        if all_reviewed:
            db_run.status = ProcessingStatus.REVIEWED

    db.commit()
    db.refresh(db_doc)
    return db_doc


# Document operations

def get_processed_document(db: Session, document_id: UUID) -> Optional[ProcessedDocument]:
    return db.query(ProcessedDocument).filter(ProcessedDocument.id == document_id).first()


def create_processed_document(
    db: Session,
    run_id: UUID,
    filename: str,
    file_path: Optional[str] = None,
    file_size: Optional[int] = None,
    mime_type: Optional[str] = None,
    status: DocumentStatus = DocumentStatus.PROCESSING,
) -> ProcessedDocument:
    db_doc = ProcessedDocument(
        processing_run_id=run_id,
        filename=filename,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        status=status,
        ocr_result={},
        extracted_fields=[],
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


def update_document_extraction_results(
    db: Session,
    document_id: UUID,
    ocr_result: Optional[dict] = None,
    extracted_fields: Optional[list[dict]] = None,
    status: DocumentStatus = DocumentStatus.NEEDS_REVIEW,
) -> Optional[ProcessedDocument]:
    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return None

    if ocr_result is not None:
        db_doc.ocr_result = ocr_result
    if extracted_fields is not None:
        db_doc.extracted_fields = extracted_fields
    db_doc.status = status

    db.commit()
    db.refresh(db_doc)
    return db_doc


def update_document_status(
    db: Session,
    document_id: UUID,
    status: DocumentStatus,
) -> Optional[ProcessedDocument]:
    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return None

    db_doc.status = status
    db.commit()
    db.refresh(db_doc)
    return db_doc


def update_extracted_field(
    db: Session,
    document_id: UUID,
    field_index: int,
    value: str,
) -> Optional[ProcessedDocument]:
    from sqlalchemy.orm.attributes import flag_modified

    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return None

    fields = db_doc.extracted_fields or []
    if field_index < 0 or field_index >= len(fields):
        return None

    fields = [dict(f) for f in fields]
    fields[field_index]["original_value"] = fields[field_index].get("original_value") or fields[field_index]["value"]
    fields[field_index]["value"] = value
    fields[field_index]["is_corrected"] = True

    db_doc.extracted_fields = fields
    flag_modified(db_doc, "extracted_fields")

    db.commit()
    db.refresh(db_doc)

    try:
        raw_text = db_doc.raw_text
        if raw_text:
            corrected = [
                f"- {f.get('name')}: {f.get('value')}"
                for f in fields
                if f.get("is_corrected")
            ]
            if corrected:
                augmented_text = "Corrected fields:\n" + "\n".join(corrected) + "\n\nOriginal text:\n" + raw_text
            else:
                augmented_text = raw_text

            from app.services.vectorstore_service import vectorstore_service

            run = db_doc.processing_run
            document_type = run.document_type if run else None
            metadata = {
                "filename": db_doc.filename,
                "document_type_id": str(run.document_type_id) if run else "",
                "document_type_name": document_type.name if document_type else "",
                "run_id": str(run.id) if run else "",
                "user_id": str(run.user_id) if run else "",
                "status": db_doc.status.value,
                "created_at": db_doc.created_at.isoformat() if db_doc.created_at else "",
            }
            vectorstore_service.update_document(db_doc.id, augmented_text, metadata)
    except Exception as e:
        print(f"Failed to update vectorstore for document {db_doc.id}: {e}")

    return db_doc


def get_extracted_fields_by_document(db: Session, document_id: UUID) -> list[dict]:
    db_doc = get_processed_document(db, document_id)
    if not db_doc:
        return []
    return db_doc.extracted_fields or []
