from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.crud import user as user_crud
from app.schemas.auth import AuthRequest, AuthResponse
from app.schemas.user import UserCreate, UserResponse
from app.models.user import UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(auth_data: AuthRequest, db: Session = Depends(get_db)):
    existing = user_crud.get_user_by_username(db, auth_data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = user_crud.create_user(
        db,
        UserCreate(
            username=auth_data.username,
            password=auth_data.password,
            full_name=auth_data.full_name,
            role=UserRole.USER
        )
    )
    token = user_crud.issue_token(db, user)
    return AuthResponse(access_token=token, user=user)


@router.post("/login", response_model=AuthResponse)
def login(auth_data: AuthRequest, db: Session = Depends(get_db)):
    user = user_crud.authenticate_user(db, auth_data.username, auth_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    token = user_crud.issue_token(db, user)
    return AuthResponse(access_token=token, user=user)


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_crud.clear_token(db, current_user)
    return {"success": True}
