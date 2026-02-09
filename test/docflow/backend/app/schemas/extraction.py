from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Any


class ExtractionRequest(BaseModel):
    fields: list[str] = []


class ExtractedFieldResult(BaseModel):
    name: str
    value: str
    confidence: float = 0.0
    coordinate: Optional[list[float]] = None
    group: Optional[str] = None
    row_index: Optional[int] = None


class ExtractionResponse(BaseModel):
    fields: list[ExtractedFieldResult]
    raw_text: str = ""
    raw_text_raw: str = ""
    json_content: dict[str, Any] = {}
    success: bool = True


class HealthCheckResponse(BaseModel):
    status: str
    message: str
    api_configured: bool


class DocumentQueryRequest(BaseModel):
    query: str


class DocumentQueryResponse(BaseModel):
    answer: str
    document_id: str


class QueryHistoryItem(BaseModel):
    id: str
    question: str
    answer: str
    error: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class QueryHistoryResponse(BaseModel):
    document_id: str
    items: list[QueryHistoryItem]
