"""Replace processes with type_of_documents"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tables = set(inspector.get_table_names())
    has_processes = "processes" in tables
    has_doc_types = "type_of_documents" in tables

    # Rename processes -> type_of_documents if needed
    if has_processes and not has_doc_types:
        op.rename_table("processes", "type_of_documents")
        has_doc_types = True

    # Adjust status values (old: inactive/needs_review/active -> new: archived/draft/active)
    if has_doc_types:
        op.execute("UPDATE type_of_documents SET status = 'draft' WHERE status = 'needs_review'")
        op.execute("UPDATE type_of_documents SET status = 'archived' WHERE status = 'inactive'")

    # Update check constraint for status (drop old if exists)
    if has_doc_types:
        op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS processes_status_check")
        op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS type_of_documents_status_check")
        op.create_check_constraint(
            "type_of_documents_status_check",
            "type_of_documents",
            "status IN ('draft', 'active', 'archived')",
        )

    # Add export_keys column
    if has_doc_types:
        columns = {col["name"] for col in inspector.get_columns("type_of_documents")}
        if "export_keys" not in columns:
            op.add_column(
                "type_of_documents",
                sa.Column(
                    "export_keys",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
            )

    # Rename process_id -> document_type_id in related tables
    if "processing_runs" in tables:
        run_cols = {col["name"] for col in inspector.get_columns("processing_runs")}
        if "process_id" in run_cols and "document_type_id" not in run_cols:
            op.execute("ALTER TABLE processing_runs RENAME COLUMN process_id TO document_type_id")
    if "triggers" in tables:
        trigger_cols = {col["name"] for col in inspector.get_columns("triggers")}
        if "process_id" in trigger_cols and "document_type_id" not in trigger_cols:
            op.execute("ALTER TABLE triggers RENAME COLUMN process_id TO document_type_id")

    # Update foreign keys
    op.execute("ALTER TABLE processing_runs DROP CONSTRAINT IF EXISTS processing_runs_process_id_fkey")
    op.execute("ALTER TABLE triggers DROP CONSTRAINT IF EXISTS triggers_process_id_fkey")

    if has_doc_types and "processing_runs" in tables:
        # Ensure referenced document types exist for existing runs
        op.execute(
            """
            INSERT INTO type_of_documents (id, user_id, name, description, status, fields, export_keys, created_at, updated_at)
            SELECT DISTINCT ON (pr.document_type_id)
                pr.document_type_id,
                pr.user_id,
                'Imported type',
                '',
                'active',
                ARRAY[]::varchar[],
                '{}'::jsonb,
                now(),
                now()
            FROM processing_runs pr
            LEFT JOIN type_of_documents t ON t.id = pr.document_type_id
            WHERE t.id IS NULL
            """
        )
        op.create_foreign_key(
            "processing_runs_document_type_id_fkey",
            "processing_runs",
            "type_of_documents",
            ["document_type_id"],
            ["id"],
            ondelete="CASCADE",
        )
    if has_doc_types and "triggers" in tables:
        # Ensure referenced document types exist for existing triggers
        op.execute(
            """
            INSERT INTO type_of_documents (id, user_id, name, description, status, fields, export_keys, created_at, updated_at)
            SELECT DISTINCT ON (tr.document_type_id)
                tr.document_type_id,
                tr.user_id,
                'Imported type',
                '',
                'active',
                ARRAY[]::varchar[],
                '{}'::jsonb,
                now(),
                now()
            FROM triggers tr
            LEFT JOIN type_of_documents t ON t.id = tr.document_type_id
            WHERE t.id IS NULL AND tr.user_id IS NOT NULL
            """
        )
        op.create_foreign_key(
            "triggers_document_type_id_fkey",
            "triggers",
            "type_of_documents",
            ["document_type_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # Add unique constraint for triggers
    if "triggers" in tables:
        op.create_unique_constraint(
            "uq_triggers_user_document_type",
            "triggers",
            ["user_id", "document_type_id"],
        )


def downgrade() -> None:
    # Drop new constraints
    op.drop_constraint("uq_triggers_user_document_type", "triggers", type_="unique")
    op.drop_constraint("triggers_document_type_id_fkey", "triggers", type_="foreignkey")
    op.drop_constraint("processing_runs_document_type_id_fkey", "processing_runs", type_="foreignkey")

    # Rename columns back
    op.execute("ALTER TABLE processing_runs RENAME COLUMN document_type_id TO process_id")
    op.execute("ALTER TABLE triggers RENAME COLUMN document_type_id TO process_id")

    # Remove export_keys
    op.drop_column("type_of_documents", "export_keys")

    # Restore status values
    op.execute("UPDATE type_of_documents SET status = 'needs_review' WHERE status = 'draft'")
    op.execute("UPDATE type_of_documents SET status = 'inactive' WHERE status = 'archived'")

    # Restore old status constraint
    op.execute("ALTER TABLE type_of_documents DROP CONSTRAINT IF EXISTS type_of_documents_status_check")
    op.create_check_constraint(
        "processes_status_check",
        "type_of_documents",
        "status IN ('inactive', 'needs_review', 'active')",
    )

    # Rename table back
    op.rename_table("type_of_documents", "processes")

    # Restore foreign keys
    op.create_foreign_key(
        "processing_runs_process_id_fkey",
        "processing_runs",
        "processes",
        ["process_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "triggers_process_id_fkey",
        "triggers",
        "processes",
        ["process_id"],
        ["id"],
        ondelete="CASCADE",
    )
