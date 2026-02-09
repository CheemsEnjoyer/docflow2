from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from uuid import UUID
from app.models.document_type import DocumentType


def get_document_type(db: Session, document_type_id: UUID) -> Optional[DocumentType]:
    return db.query(DocumentType).filter(DocumentType.id == document_type_id).first()


def get_document_types(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    user_id: Optional[UUID] = None,
) -> tuple[list[DocumentType], int]:
    query = db.query(DocumentType)
    if user_id:
        query = query.filter(DocumentType.user_id == user_id)
    if search:
        query = query.filter(DocumentType.name.ilike(f"%{search}%"))
    total = query.count()

    sort_column = getattr(DocumentType, sort_by, DocumentType.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    items = query.offset(skip).limit(limit).all()
    return items, total


def create_document_type(db: Session, data: dict, user_id: UUID) -> DocumentType:
    db_doc = DocumentType(
        user_id=user_id,
        name=data.get("name"),
        description=data.get("description") or "",
        fields=data.get("fields") or [],
        export_keys=data.get("export_keys") or {},
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


def update_document_type(db: Session, document_type_id: UUID, updates: dict) -> Optional[DocumentType]:
    db_doc = get_document_type(db, document_type_id)
    if not db_doc:
        return None
    if "name" in updates and updates["name"] is not None:
        db_doc.name = updates["name"]
    if "description" in updates and updates["description"] is not None:
        db_doc.description = updates["description"]
    if "fields" in updates and updates["fields"] is not None:
        db_doc.fields = updates["fields"]
    if "export_keys" in updates and updates["export_keys"] is not None:
        db_doc.export_keys = updates["export_keys"]

    db.commit()
    db.refresh(db_doc)
    return db_doc


def delete_document_type(db: Session, document_type_id: UUID) -> bool:
    db_doc = get_document_type(db, document_type_id)
    if not db_doc:
        return False
    db.delete(db_doc)
    db.commit()
    return True
