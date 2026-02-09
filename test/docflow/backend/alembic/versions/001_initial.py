"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create processes table
    op.create_table(
        'processes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True, default=''),
        sa.Column('status', sa.Enum('inactive', 'needs_review', 'active', name='processstatus'), nullable=False, server_default='inactive'),
        sa.Column('fields', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('trigger_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('trigger_folder', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_processes_name', 'processes', ['name'])
    op.create_index('ix_processes_status', 'processes', ['status'])
    op.create_index('ix_processes_created_at', 'processes', ['created_at'])

    # Create processing_runs table
    op.create_table(
        'processing_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('process_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source', sa.Enum('manual', 'trigger', name='processingsource'), nullable=False, server_default='manual'),
        sa.Column('trigger_name', sa.String(255), nullable=True),
        sa.Column('status', sa.Enum('processing', 'needs_review', 'reviewed', 'error', name='processingstatus'), nullable=False, server_default='processing'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['process_id'], ['processes.id'], ondelete='CASCADE')
    )
    op.create_index('ix_processing_runs_process_id', 'processing_runs', ['process_id'])
    op.create_index('ix_processing_runs_status', 'processing_runs', ['status'])
    op.create_index('ix_processing_runs_created_at', 'processing_runs', ['created_at'])

    # Create processed_documents table
    op.create_table(
        'processed_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('processing_run_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(500), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=False),
        sa.Column('file_path', sa.String(1000), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('processing', 'needs_review', 'reviewed', 'error', name='documentstatus'), nullable=False, server_default='processing'),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('html_content', sa.Text(), nullable=True),
        sa.Column('json_content', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['processing_run_id'], ['processing_runs.id'], ondelete='CASCADE')
    )
    op.create_index('ix_processed_documents_run_id', 'processed_documents', ['processing_run_id'])
    op.create_index('ix_processed_documents_status', 'processed_documents', ['status'])

    # Create extracted_fields table
    op.create_table(
        'extracted_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('coordinate', postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column('original_value', sa.Text(), nullable=True),
        sa.Column('is_corrected', sa.String(10), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['processed_documents.id'], ondelete='CASCADE')
    )
    op.create_index('ix_extracted_fields_document_id', 'extracted_fields', ['document_id'])
    op.create_index('ix_extracted_fields_name', 'extracted_fields', ['name'])


def downgrade() -> None:
    op.drop_table('extracted_fields')
    op.drop_table('processed_documents')
    op.drop_table('processing_runs')
    op.drop_table('processes')

    # Drop enum types
    op.execute('DROP TYPE IF EXISTS processstatus')
    op.execute('DROP TYPE IF EXISTS processingsource')
    op.execute('DROP TYPE IF EXISTS processingstatus')
    op.execute('DROP TYPE IF EXISTS documentstatus')
