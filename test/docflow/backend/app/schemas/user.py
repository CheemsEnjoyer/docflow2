from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime
from uuid import UUID


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class UserBase(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    full_name: Optional[str] = Field(None, max_length=255)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = UserRole.USER


class UserResponse(UserBase):
    id: UUID
    role: UserRole
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
