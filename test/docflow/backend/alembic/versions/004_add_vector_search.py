"""Enable pgvector extension for LangChain vector search

Revision ID: 004
Revises: 003
Create Date: 2024-01-22

Note: LangChain PGVector creates its own tables for storing embeddings.
This migration only enables the pgvector extension.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension (required for LangChain PGVector)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Note: We don't drop the vector extension as it may be used by LangChain tables
    # or other applications. The extension is generally safe to keep.
    pass
