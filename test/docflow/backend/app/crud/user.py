from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import asc
from app.models.user import User, UserRole
from app.schemas.user import UserCreate
from app.core.security import hash_password, verify_password, create_token

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin"


def get_user(db: Session, user_id: UUID) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return (
        db.query(User)
        .order_by(asc(User.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_user(db: Session, user_data: UserCreate) -> User:
    password_hash, password_salt = hash_password(user_data.password)
    db_user = User(
        username=user_data.username,
        full_name=user_data.full_name,
        role=user_data.role,
        password_hash=password_hash,
        password_salt=password_salt
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_salt, user.password_hash):
        return None
    return user


def issue_token(db: Session, user: User) -> str:
    token = create_token()
    user.api_token = token
    db.commit()
    db.refresh(user)
    return token


def clear_token(db: Session, user: User) -> None:
    user.api_token = None
    db.commit()


def ensure_default_admin(db: Session) -> User:
    user = db.query(User).order_by(asc(User.created_at)).first()
    if user:
        return user
    password_hash, password_salt = hash_password(DEFAULT_ADMIN_PASSWORD)
    user = User(
        username=DEFAULT_ADMIN_USERNAME,
        role=UserRole.ADMIN,
        full_name=None,
        password_hash=password_hash,
        password_salt=password_salt
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
