from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DocumentQuery(Base, UUIDMixin, TimestampMixin):
    """Stores AI assistant query/answer history for a processed document"""
    __tablename__ = "document_queries"

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processed_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False, default="")
    error = Column(String(500), nullable=True)

    # Relationships
    document = relationship("ProcessedDocument", backref="queries")
    user = relationship("User")

    def __repr__(self):
        return f"<DocumentQuery(id={self.id}, document_id={self.document_id})>"
