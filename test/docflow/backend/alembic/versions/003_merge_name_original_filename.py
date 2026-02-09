"""Merge name and original_filename into filename

Revision ID: 003
Revises: 002
Create Date: 2024-01-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename original_filename to filename
    op.alter_column('processed_documents', 'original_filename', new_column_name='filename')

    # Drop name column
    op.drop_column('processed_documents', 'name')


def downgrade() -> None:
    # Add name column back
    op.add_column('processed_documents', sa.Column('name', sa.String(500), nullable=False, server_default=''))

    # Copy filename to name
    op.execute("UPDATE processed_documents SET name = filename")

    # Rename filename back to original_filename
    op.alter_column('processed_documents', 'filename', new_column_name='original_filename')
