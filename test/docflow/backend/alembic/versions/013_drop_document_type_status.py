"""Drop status from type_of_documents"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "type_of_documents" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("type_of_documents")}
    if "status" in columns:
        op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS type_of_documents_status_check")
        op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS processes_status_check")
        op.drop_column("type_of_documents", "status")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "type_of_documents" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("type_of_documents")}
    if "status" not in columns:
        op.add_column(
            "type_of_documents",
            sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        )
        op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS type_of_documents_status_check")
        op.execute("ALTER TABLE type_of_documents ADD CONSTRAINT type_of_documents_status_check CHECK (status IN ('draft','active','archived'))")
