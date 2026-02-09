import hashlib
import hmac
import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole

PBKDF2_ITERATIONS = 120_000


def hash_password(password: str, salt_hex: Optional[str] = None) -> tuple[str, str]:
    if salt_hex:
        salt = bytes.fromhex(salt_hex)
    else:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return digest.hex(), salt.hex()


def verify_password(password: str, salt_hex: str, expected_hash: str) -> bool:
    digest, _ = hash_password(password, salt_hex=salt_hex)
    return hmac.compare_digest(digest, expected_hash)


def create_token() -> str:
    return secrets.token_urlsafe(32)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = db.query(User).filter(User.api_token == token).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
