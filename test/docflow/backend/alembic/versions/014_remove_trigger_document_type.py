"""Remove document_type_id from triggers - auto-classification replaces it"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "triggers" not in inspector.get_table_names():
        return

    # Drop unique constraint
    constraints = inspector.get_unique_constraints("triggers")
    for c in constraints:
        if c["name"] == "uq_triggers_user_document_type":
            op.drop_constraint("uq_triggers_user_document_type", "triggers", type_="unique")
            break

    # Drop foreign key
    fks = inspector.get_foreign_keys("triggers")
    for fk in fks:
        if "document_type_id" in fk.get("constrained_columns", []):
            op.drop_constraint(fk["name"], "triggers", type_="foreignkey")
            break

    # Drop column
    columns = {col["name"] for col in inspector.get_columns("triggers")}
    if "document_type_id" in columns:
        op.drop_column("triggers", "document_type_id")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "triggers" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("triggers")}
    if "document_type_id" not in columns:
        op.add_column(
            "triggers",
            sa.Column("document_type_id", UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "triggers_document_type_id_fkey",
            "triggers",
            "type_of_documents",
            ["document_type_id"],
            ["id"],
            ondelete="CASCADE",
        )
