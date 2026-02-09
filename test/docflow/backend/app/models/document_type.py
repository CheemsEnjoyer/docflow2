from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY, UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DocumentType(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "type_of_documents"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True, default="")
    fields = Column(ARRAY(String), default=list, nullable=False)
    export_keys = Column(JSONB, nullable=True, default=dict)

    user = relationship("User", back_populates="document_types")
    processing_runs = relationship(
        "ProcessingRun",
        back_populates="document_type",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def __repr__(self):
        return f"<DocumentType(id={self.id}, name='{self.name}')>"
