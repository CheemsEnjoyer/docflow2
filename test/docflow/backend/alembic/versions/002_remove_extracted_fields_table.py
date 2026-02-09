"""Simplify processed_documents: remove extracted_fields table, merge OCR columns into JSONB

Revision ID: 002
Revises: 001
Create Date: 2024-01-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add extracted_fields JSONB column
    op.add_column(
        'processed_documents',
        sa.Column('extracted_fields', postgresql.JSONB(), nullable=True, server_default='[]')
    )

    # 2. Add ocr_result JSONB column
    op.add_column(
        'processed_documents',
        sa.Column('ocr_result', postgresql.JSONB(), nullable=True, server_default='{}')
    )

    # 3. Migrate extracted_fields data from table to JSONB column
    op.execute("""
        UPDATE processed_documents pd
        SET extracted_fields = (
            SELECT COALESCE(
                json_agg(
                    json_build_object(
                        'name', ef.name,
                        'value', ef.value,
                        'confidence', ef.confidence,
                        'coordinate', ef.coordinate,
                        'original_value', ef.original_value,
                        'is_corrected', CASE WHEN ef.is_corrected = 'true' THEN true ELSE false END
                    )
                ),
                '[]'::json
            )
            FROM extracted_fields ef
            WHERE ef.document_id = pd.id
        )
    """)

    # 4. Migrate raw_text, html_content, json_content to ocr_result JSONB
    op.execute("""
        UPDATE processed_documents
        SET ocr_result = json_build_object(
            'raw_text', COALESCE(raw_text, ''),
            'html_content', COALESCE(html_content, ''),
            'json_content', COALESCE(json_content, '{}'::jsonb)
        )
    """)

    # 5. Drop extracted_fields table
    op.drop_table('extracted_fields')

    # 6. Drop old columns
    op.drop_column('processed_documents', 'raw_text')
    op.drop_column('processed_documents', 'html_content')
    op.drop_column('processed_documents', 'json_content')


def downgrade() -> None:
    # 1. Add back old columns
    op.add_column('processed_documents', sa.Column('raw_text', sa.Text(), nullable=True))
    op.add_column('processed_documents', sa.Column('html_content', sa.Text(), nullable=True))
    op.add_column('processed_documents', sa.Column('json_content', postgresql.JSONB(), nullable=True))

    # 2. Migrate data back from ocr_result to separate columns
    op.execute("""
        UPDATE processed_documents
        SET
            raw_text = ocr_result->>'raw_text',
            html_content = ocr_result->>'html_content',
            json_content = ocr_result->'json_content'
        WHERE ocr_result IS NOT NULL
    """)

    # 3. Recreate extracted_fields table
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

    # 4. Migrate data back from JSONB to table
    op.execute("""
        INSERT INTO extracted_fields (id, document_id, name, value, confidence, coordinate, original_value, is_corrected, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            pd.id,
            (field->>'name')::varchar(255),
            field->>'value',
            (field->>'confidence')::float,
            CASE
                WHEN field->'coordinate' IS NOT NULL AND field->>'coordinate' != 'null'
                THEN ARRAY(SELECT (jsonb_array_elements_text(field->'coordinate'))::float)
                ELSE NULL
            END,
            field->>'original_value',
            CASE WHEN (field->>'is_corrected')::boolean THEN 'true' ELSE 'false' END,
            pd.created_at,
            pd.updated_at
        FROM processed_documents pd,
        jsonb_array_elements(pd.extracted_fields) AS field
        WHERE pd.extracted_fields IS NOT NULL AND jsonb_array_length(pd.extracted_fields) > 0
    """)

    # 5. Drop new columns
    op.drop_column('processed_documents', 'extracted_fields')
    op.drop_column('processed_documents', 'ocr_result')
