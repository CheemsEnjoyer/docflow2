"""Add email trigger fields

Revision ID: 010
Revises: 009
Create Date: 2026-01-27
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    trigger_type_enum = sa.Enum("folder", "email", name="triggertype")
    trigger_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "triggers",
        sa.Column("type", trigger_type_enum, nullable=False, server_default="folder"),
    )
    op.add_column("triggers", sa.Column("email_host", sa.String(length=255), nullable=True))
    op.add_column("triggers", sa.Column("email_port", sa.Integer(), nullable=True))
    op.add_column("triggers", sa.Column("email_username", sa.String(length=255), nullable=True))
    op.add_column("triggers", sa.Column("email_password", sa.String(length=255), nullable=True))
    op.add_column("triggers", sa.Column("email_folder", sa.String(length=255), nullable=True))
    op.add_column(
        "triggers",
        sa.Column("email_use_ssl", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("triggers", sa.Column("email_search", sa.String(length=255), nullable=True))

    op.alter_column("triggers", "type", server_default=None)
    op.alter_column("triggers", "email_use_ssl", server_default=None)


def downgrade() -> None:
    op.drop_column("triggers", "email_search")
    op.drop_column("triggers", "email_use_ssl")
    op.drop_column("triggers", "email_folder")
    op.drop_column("triggers", "email_password")
    op.drop_column("triggers", "email_username")
    op.drop_column("triggers", "email_port")
    op.drop_column("triggers", "email_host")
    op.drop_column("triggers", "type")

    trigger_type_enum = sa.Enum("folder", "email", name="triggertype")
    trigger_type_enum.drop(op.get_bind(), checkfirst=True)
