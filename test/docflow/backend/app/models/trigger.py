from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Trigger(Base, UUIDMixin, TimestampMixin):
    """Trigger configuration — monitors folder and auto-classifies documents."""
    __tablename__ = "triggers"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    enabled = Column(Boolean, default=False, nullable=False)
    folder = Column(String(500), nullable=True)

    user = relationship("User", back_populates="triggers")

    def __repr__(self):
        return f"<Trigger(id={self.id}, user_id={self.user_id}, enabled={self.enabled})>"
