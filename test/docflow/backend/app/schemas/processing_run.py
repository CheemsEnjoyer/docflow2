from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID
from enum import Enum


class ProcessingStatus(str, Enum):
    PROCESSING = "processing"
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    ERROR = "error"


class ProcessingSource(str, Enum):
    MANUAL = "manual"
    TRIGGER = "trigger"


# Extracted field schema (embedded in document as JSONB)
class ExtractedField(BaseModel):
    name: str
    value: Optional[str] = None
    confidence: Optional[float] = 0.0
    coordinate: Optional[list[float]] = None
    group: Optional[str] = None
    row_index: Optional[int] = None
    original_value: Optional[str] = None
    is_corrected: bool = False


class ExtractedFieldUpdate(BaseModel):
    field_index: int
    value: str


# Processed document schemas
class ProcessedDocumentBase(BaseModel):
    filename: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None


class ProcessedDocumentCreate(ProcessedDocumentBase):
    pass


class ProcessedDocumentResponse(ProcessedDocumentBase):
    id: UUID
    status: ProcessingStatus
    raw_text: Optional[str] = None
    raw_text_raw: Optional[str] = None
    highlighted_image: Optional[str] = None
    preview_image: Optional[str] = None
    fields_count: int = 0
    extracted_fields: list[ExtractedField] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ProcessedDocumentBrief(BaseModel):
    id: UUID
    filename: str
    status: ProcessingStatus
    fields_count: int = 0

    class Config:
        from_attributes = True


# Processing run schemas
class ProcessingRunBase(BaseModel):
    source: ProcessingSource = ProcessingSource.MANUAL
    trigger_name: Optional[str] = None


class ProcessingRunCreate(ProcessingRunBase):
    document_type_id: UUID
    user_id: Optional[UUID] = None


class ProcessingRunResponse(ProcessingRunBase):
    id: UUID
    document_type_id: UUID
    document_type_name: Optional[str] = None
    user_id: UUID
    status: ProcessingStatus
    documents: list[ProcessedDocumentBrief] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProcessingRunDetailResponse(ProcessingRunBase):
    id: UUID
    document_type_id: UUID
    document_type_name: Optional[str] = None
    user_id: UUID
    status: ProcessingStatus
    documents: list[ProcessedDocumentResponse] = []
    created_at: datetime
    updated_at: datetime


class ProcessingRunDocumentTypeUpdate(BaseModel):
    document_type_id: UUID

    class Config:
        from_attributes = True


class ProcessingRunListResponse(BaseModel):
    items: list[ProcessingRunResponse]
    total: int
