"""Add full name to users

Revision ID: 009
Revises: 008
Create Date: 2024-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'users' not in tables:
        return

    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'full_name' not in columns:
        op.add_column('users', sa.Column('full_name', sa.String(255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'users' not in tables:
        return

    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'full_name' in columns:
        op.drop_column('users', 'full_name')
