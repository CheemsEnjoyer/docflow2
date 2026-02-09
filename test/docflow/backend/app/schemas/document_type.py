from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
class DocumentTypeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    fields: list[str] = []
    export_keys: dict[str, str] = {}


class DocumentTypeCreate(DocumentTypeBase):
    pass


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[list[str]] = None
    export_keys: Optional[dict[str, str]] = None


class DocumentTypeResponse(DocumentTypeBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentTypeListResponse(BaseModel):
    items: list[DocumentTypeResponse]
    total: int
    page: int
    page_size: int
    pages: int
