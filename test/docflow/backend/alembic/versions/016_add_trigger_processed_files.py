"""Add processed_files column to triggers for folder monitoring"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [c["name"] for c in inspector.get_columns(table)]
    return column in columns


def upgrade():
    if not _has_column("triggers", "processed_files"):
        op.add_column(
            "triggers",
            sa.Column("processed_files", JSONB, server_default="[]", nullable=False),
        )


def downgrade():
    if _has_column("triggers", "processed_files"):
        op.drop_column("triggers", "processed_files")
