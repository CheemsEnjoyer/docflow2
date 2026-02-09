from typing import Optional
from pydantic import BaseModel, Field
from app.schemas.user import UserResponse


class AuthRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse
