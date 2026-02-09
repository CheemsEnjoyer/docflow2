from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.trigger import Trigger
from app.schemas.trigger import TriggerCreate, TriggerUpdate


def get_trigger(db: Session, trigger_id: UUID) -> Optional[Trigger]:
    return db.query(Trigger).filter(Trigger.id == trigger_id).first()


def get_triggers(
    db: Session,
    user_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100
) -> list[Trigger]:
    query = db.query(Trigger)
    if user_id:
        query = query.filter(Trigger.user_id == user_id)
    return query.order_by(desc(Trigger.created_at)).offset(skip).limit(limit).all()


def create_trigger(db: Session, trigger_data: TriggerCreate) -> Trigger:
    db_trigger = Trigger(**trigger_data.model_dump())
    db.add(db_trigger)
    db.commit()
    db.refresh(db_trigger)
    return db_trigger


def update_trigger(db: Session, trigger_id: UUID, trigger_data: TriggerUpdate) -> Optional[Trigger]:
    db_trigger = get_trigger(db, trigger_id)
    if not db_trigger:
        return None

    update_data = trigger_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_trigger, field, value)

    db.commit()
    db.refresh(db_trigger)
    return db_trigger


def delete_trigger(db: Session, trigger_id: UUID) -> bool:
    db_trigger = get_trigger(db, trigger_id)
    if not db_trigger:
        return False
    db.delete(db_trigger)
    db.commit()
    return True
