from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import UserRole
from app.crud import trigger as trigger_crud
from app.crud import user as user_crud
from app.schemas.trigger import TriggerCreate, TriggerUpdate, TriggerResponse

router = APIRouter(prefix="/triggers", tags=["triggers"])


@router.get("", response_model=list[TriggerResponse])
def list_triggers(
    user_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    effective_user_id = user_id if current_user.role == UserRole.ADMIN else current_user.id
    return trigger_crud.get_triggers(db, user_id=effective_user_id, skip=skip, limit=limit)


@router.get("/{trigger_id}", response_model=TriggerResponse)
def get_trigger(trigger_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    trigger = trigger_crud.get_trigger(db, trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    if current_user.role != UserRole.ADMIN and trigger.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return trigger


@router.post("", response_model=TriggerResponse, status_code=201)
def create_trigger(trigger_data: TriggerCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    target_user_id = trigger_data.user_id if current_user.role == UserRole.ADMIN else current_user.id
    user = user_crud.get_user(db, target_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = trigger_data.model_dump()
    payload["user_id"] = target_user_id
    return trigger_crud.create_trigger(db, TriggerCreate(**payload))


@router.patch("/{trigger_id}", response_model=TriggerResponse)
def update_trigger(
    trigger_id: UUID,
    trigger_data: TriggerUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    trigger = trigger_crud.get_trigger(db, trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    if current_user.role != UserRole.ADMIN and trigger.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    updated = trigger_crud.update_trigger(db, trigger_id, trigger_data)
    return updated


@router.delete("/{trigger_id}", status_code=204)
def delete_trigger(trigger_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    trigger = trigger_crud.get_trigger(db, trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    if current_user.role != UserRole.ADMIN and trigger.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    success = trigger_crud.delete_trigger(db, trigger_id)
    if not success:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return None
