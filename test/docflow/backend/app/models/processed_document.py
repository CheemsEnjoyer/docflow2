import enum
from sqlalchemy import Column, String, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DocumentStatus(str, enum.Enum):
    PROCESSING = "processing"
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    ERROR = "error"


class ProcessedDocument(Base, UUIDMixin, TimestampMixin):
    """Processed document model - represents a single document in a processing run"""
    __tablename__ = "processed_documents"

    processing_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_runs.id", ondelete="CASCADE"),
        nullable=False
    )
    filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=True)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    status = Column(
        Enum(DocumentStatus, values_callable=lambda x: [e.value for e in x]),
        default=DocumentStatus.PROCESSING,
        nullable=False
    )

    # OCR Result as single JSONB
    # Structure: {"raw_text": str, "raw_text_raw": str, "json_content": dict, "highlighted_image": str}
    ocr_result = Column(JSONB, nullable=True, default=dict)

    # Extracted fields as JSONB array
    # Structure: [{"name": str, "value": str, "confidence": float, "coordinate": [x1,y1,x2,y2], "original_value": str, "is_corrected": bool}]
    extracted_fields = Column(JSONB, nullable=True, default=list)

    # Note: Vector embeddings are now stored in LangChain PGVector's own table

    # Relationships
    processing_run = relationship("ProcessingRun", back_populates="documents")

    @property
    def fields_count(self) -> int:
        return len(self.extracted_fields) if self.extracted_fields else 0

    @property
    def raw_text(self) -> str:
        return (self.ocr_result or {}).get("raw_text", "")

    @property
    def raw_text_raw(self) -> str:
        return (self.ocr_result or {}).get("raw_text_raw", "")

    @property
    def json_content(self) -> dict:
        return (self.ocr_result or {}).get("json_content", {})

    @property
    def highlighted_image(self) -> str | None:
        return (self.ocr_result or {}).get("highlighted_image")

    @property
    def preview_image(self) -> str | None:
        return (self.ocr_result or {}).get("preview_image")

    def __repr__(self):
        return f"<ProcessedDocument(id={self.id}, filename='{self.filename}', status={self.status})>"
