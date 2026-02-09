"""Create triggers table and move process trigger config

Revision ID: 005
Revises: 004
Create Date: 2024-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'triggers' not in tables:
        op.create_table(
            'triggers',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('process_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('folder', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['process_id'], ['processes.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('process_id', name='uq_triggers_process_id')
        )
        op.create_index('ix_triggers_process_id', 'triggers', ['process_id'])
        tables.add('triggers')

    process_columns = {column['name'] for column in inspector.get_columns('processes')}
    if {'trigger_enabled', 'trigger_folder'} & process_columns:
        if 'triggers' in tables:
            op.execute(
                """
                INSERT INTO triggers (id, process_id, enabled, folder, created_at, updated_at)
                SELECT id, id, trigger_enabled, trigger_folder, created_at, updated_at
                FROM processes
                ON CONFLICT (process_id) DO NOTHING
                """
            )

        if 'trigger_enabled' in process_columns:
            op.drop_column('processes', 'trigger_enabled')
        if 'trigger_folder' in process_columns:
            op.drop_column('processes', 'trigger_folder')


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'processes' in tables:
        process_columns = {column['name'] for column in inspector.get_columns('processes')}
        if 'trigger_folder' not in process_columns:
            op.add_column('processes', sa.Column('trigger_folder', sa.String(500), nullable=True))
        if 'trigger_enabled' not in process_columns:
            op.add_column('processes', sa.Column('trigger_enabled', sa.Boolean(), nullable=False, server_default='false'))

        if 'triggers' in tables:
            op.execute(
                """
                UPDATE processes
                SET trigger_enabled = triggers.enabled,
                    trigger_folder = triggers.folder
                FROM triggers
                WHERE triggers.process_id = processes.id
                """
            )

    if 'triggers' in tables:
        op.drop_index('ix_triggers_process_id', table_name='triggers')
        op.drop_table('triggers')
