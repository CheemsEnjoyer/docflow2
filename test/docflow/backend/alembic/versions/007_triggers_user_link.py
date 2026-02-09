"""Link triggers to users and allow multiple triggers per process

Revision ID: 007
Revises: 006
Create Date: 2024-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'triggers' not in tables:
        return

    columns = {column['name'] for column in inspector.get_columns('triggers')}
    if 'user_id' not in columns:
        op.add_column('triggers', sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True))
        op.execute(
            """
            UPDATE triggers
            SET user_id = processes.user_id
            FROM processes
            WHERE triggers.process_id = processes.id
            """
        )
        op.alter_column('triggers', 'user_id', nullable=False)
        op.create_foreign_key(
            'fk_triggers_user_id',
            'triggers',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )
        op.create_index('ix_triggers_user_id', 'triggers', ['user_id'])

    # Drop unique constraint on process_id if it exists
    unique_constraints = {uc['name'] for uc in inspector.get_unique_constraints('triggers')}
    if 'uq_triggers_process_id' in unique_constraints:
        op.drop_constraint('uq_triggers_process_id', 'triggers', type_='unique')

    # Add unique constraint on (user_id, process_id) if missing
    unique_constraints = {uc['name'] for uc in inspector.get_unique_constraints('triggers')}
    if 'uq_triggers_user_process' not in unique_constraints:
        op.create_unique_constraint('uq_triggers_user_process', 'triggers', ['user_id', 'process_id'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if 'triggers' not in tables:
        return

    unique_constraints = {uc['name'] for uc in inspector.get_unique_constraints('triggers')}
    if 'uq_triggers_user_process' in unique_constraints:
        op.drop_constraint('uq_triggers_user_process', 'triggers', type_='unique')

    columns = {column['name'] for column in inspector.get_columns('triggers')}
    if 'user_id' in columns:
        op.drop_index('ix_triggers_user_id', table_name='triggers')
        op.drop_constraint('fk_triggers_user_id', 'triggers', type_='foreignkey')
        op.drop_column('triggers', 'user_id')

    unique_constraints = {uc['name'] for uc in inspector.get_unique_constraints('triggers')}
    if 'uq_triggers_process_id' not in unique_constraints:
        op.create_unique_constraint('uq_triggers_process_id', 'triggers', ['process_id'])
