from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class TriggerBase(BaseModel):
    user_id: UUID
    enabled: bool = False
    folder: Optional[str] = None


class TriggerCreate(TriggerBase):
    pass


class TriggerUpdate(BaseModel):
    enabled: Optional[bool] = None
    folder: Optional[str] = None


class TriggerResponse(TriggerBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
