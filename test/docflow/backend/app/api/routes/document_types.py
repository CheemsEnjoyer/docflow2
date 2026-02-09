from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.user import UserRole
from app.crud import document_type as document_type_crud
from app.schemas.document_type import (
    DocumentTypeResponse,
    DocumentTypeListResponse,
    DocumentTypeCreate,
    DocumentTypeUpdate,
)

router = APIRouter(prefix="/document-types", tags=["document-types"])


@router.get("", response_model=DocumentTypeListResponse)
def list_document_types(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at", pattern="^(name|created_at)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    skip = (page - 1) * page_size
    effective_user_id = None
    items, total = document_type_crud.get_document_types(
        db,
        skip=skip,
        limit=page_size,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        user_id=effective_user_id,
    )
    pages = max(1, (total + page_size - 1) // page_size)
    return DocumentTypeListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{document_type_id}", response_model=DocumentTypeResponse)
def get_document_type(document_type_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    doc_type = document_type_crud.get_document_type(db, document_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    if current_user.role != UserRole.ADMIN and doc_type.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return doc_type


@router.post("", response_model=DocumentTypeResponse)
def create_document_type(
    payload: DocumentTypeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    return document_type_crud.create_document_type(db, payload.model_dump(), current_user.id)


@router.put("/{document_type_id}", response_model=DocumentTypeResponse)
def update_document_type(
    document_type_id: UUID,
    payload: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    doc_type = document_type_crud.get_document_type(db, document_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    if current_user.role != UserRole.ADMIN and doc_type.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    updated = document_type_crud.update_document_type(db, document_type_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Document type not found")
    return updated


@router.delete("/{document_type_id}", status_code=204)
def delete_document_type(document_type_id: UUID, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    doc_type = document_type_crud.get_document_type(db, document_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    if current_user.role != UserRole.ADMIN and doc_type.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    success = document_type_crud.delete_document_type(db, document_type_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document type not found")
    return None
