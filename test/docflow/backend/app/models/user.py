import enum
from sqlalchemy import Column, String, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class User(Base, UUIDMixin, TimestampMixin):
    """System user"""
    __tablename__ = "users"

    username = Column(String(255), nullable=False, unique=True)
    full_name = Column(String(255), nullable=True)
    password_hash = Column(String(128), nullable=False)
    password_salt = Column(String(64), nullable=False)
    api_token = Column(String(255), nullable=True, index=True)
    role = Column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.USER,
        nullable=False
    )

    document_types = relationship(
        "DocumentType",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    processing_runs = relationship(
        "ProcessingRun",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    triggers = relationship(
        "Trigger",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role={self.role})>"
