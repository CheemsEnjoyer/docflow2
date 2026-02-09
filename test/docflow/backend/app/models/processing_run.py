import enum
from sqlalchemy import Column, String, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ProcessingStatus(str, enum.Enum):
    PROCESSING = "processing"
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    ERROR = "error"


class ProcessingSource(str, enum.Enum):
    MANUAL = "manual"
    TRIGGER = "trigger"


class ProcessingRun(Base, UUIDMixin, TimestampMixin):
    """Processing run model - represents a single execution of document processing"""
    __tablename__ = "processing_runs"

    document_type_id = Column(UUID(as_uuid=True), ForeignKey("type_of_documents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source = Column(
        Enum(ProcessingSource, values_callable=lambda x: [e.value for e in x]),
        default=ProcessingSource.MANUAL,
        nullable=False
    )
    trigger_name = Column(String(255), nullable=True)
    status = Column(
        Enum(ProcessingStatus, values_callable=lambda x: [e.value for e in x]),
        default=ProcessingStatus.PROCESSING,
        nullable=False
    )

    # Relationships
    document_type = relationship("DocumentType", back_populates="processing_runs", lazy="selectin")
    user = relationship("User", back_populates="processing_runs")
    documents = relationship(
        "ProcessedDocument",
        back_populates="processing_run",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self):
        return f"<ProcessingRun(id={self.id}, document_type_id={self.document_type_id}, status={self.status})>"

    @property
    def document_type_name(self):
        if self.document_type:
            return self.document_type.name
        return None
