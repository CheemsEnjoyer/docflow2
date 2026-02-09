"""Add password and token fields to users

Revision ID: 008
Revises: 007
Create Date: 2024-02-01

"""
from typing import Sequence, Union
import hashlib
import secrets

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PBKDF2_ITERATIONS = 120_000


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return digest.hex()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'users' not in tables:
        return

    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'password_hash' not in columns:
        op.add_column('users', sa.Column('password_hash', sa.String(128), nullable=True))
    if 'password_salt' not in columns:
        op.add_column('users', sa.Column('password_salt', sa.String(64), nullable=True))
    if 'api_token' not in columns:
        op.add_column('users', sa.Column('api_token', sa.String(255), nullable=True))
        op.create_index('ix_users_api_token', 'users', ['api_token'])

    user_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM users")).fetchall()]
    for user_id in user_ids:
        salt = secrets.token_bytes(16)
        password_hash = _hash_password("admin", salt)
        bind.execute(
            sa.text(
                """
                UPDATE users
                SET password_hash = :password_hash,
                    password_salt = :password_salt
                WHERE id = :user_id
                """
            ),
            {
                "password_hash": password_hash,
                "password_salt": salt.hex(),
                "user_id": str(user_id)
            }
        )

    op.alter_column('users', 'password_hash', nullable=False)
    op.alter_column('users', 'password_salt', nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'users' not in tables:
        return

    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'api_token' in columns:
        op.drop_index('ix_users_api_token', table_name='users')
        op.drop_column('users', 'api_token')
    if 'password_hash' in columns:
        op.drop_column('users', 'password_hash')
    if 'password_salt' in columns:
        op.drop_column('users', 'password_salt')
