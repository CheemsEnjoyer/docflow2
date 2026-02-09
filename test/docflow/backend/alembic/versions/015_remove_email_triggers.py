"""Remove email trigger fields — triggers are folder-only now"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [c["name"] for c in inspector.get_columns(table)]
    return column in columns


def upgrade():
    email_columns = [
        "email_host",
        "email_port",
        "email_username",
        "email_password",
        "email_folder",
        "email_use_ssl",
        "email_search",
    ]
    for col in email_columns:
        if _has_column("triggers", col):
            op.drop_column("triggers", col)

    if _has_column("triggers", "type"):
        op.drop_column("triggers", "type")

    # Drop the enum type if it exists
    op.execute("DROP TYPE IF EXISTS triggertype")


def downgrade():
    # Re-create type column and email columns
    trigger_type = sa.Enum("folder", "email", name="triggertype")
    trigger_type.create(op.get_bind(), checkfirst=True)

    op.add_column("triggers", sa.Column("type", trigger_type, server_default="folder", nullable=False))
    op.add_column("triggers", sa.Column("email_host", sa.String(255), nullable=True))
    op.add_column("triggers", sa.Column("email_port", sa.Integer(), nullable=True))
    op.add_column("triggers", sa.Column("email_username", sa.String(255), nullable=True))
    op.add_column("triggers", sa.Column("email_password", sa.String(255), nullable=True))
    op.add_column("triggers", sa.Column("email_folder", sa.String(255), nullable=True))
    op.add_column("triggers", sa.Column("email_use_ssl", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("triggers", sa.Column("email_search", sa.String(255), nullable=True))
