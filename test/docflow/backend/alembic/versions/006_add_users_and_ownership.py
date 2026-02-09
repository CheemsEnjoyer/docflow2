"""Add users and ownership for processes and runs

Revision ID: 006
Revises: 005
Create Date: 2024-02-01

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'users' not in tables:
        op.create_table(
            'users',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('username', sa.String(255), nullable=False),
            sa.Column('role', sa.Enum('admin', 'user', name='userrole'), nullable=False, server_default='user'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('username', name='uq_users_username')
        )
        op.create_index('ix_users_username', 'users', ['username'])
        tables.add('users')

    default_user_id = bind.execute(
        sa.text("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    ).scalar_one_or_none()
    if default_user_id is None:
        default_user_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO users (id, username, role, created_at, updated_at)
                VALUES (:id, :username, :role, now(), now())
                """
            ),
            {"id": str(default_user_id), "username": "admin", "role": "admin"}
        )

    process_columns = {column['name'] for column in inspector.get_columns('processes')}
    if 'user_id' not in process_columns:
        op.add_column('processes', sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True))
        bind.execute(
            sa.text("UPDATE processes SET user_id = :user_id WHERE user_id IS NULL"),
            {"user_id": str(default_user_id)}
        )
        op.alter_column('processes', 'user_id', nullable=False)
        op.create_foreign_key(
            'fk_processes_user_id',
            'processes',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )
        op.create_index('ix_processes_user_id', 'processes', ['user_id'])

    run_columns = {column['name'] for column in inspector.get_columns('processing_runs')}
    if 'user_id' not in run_columns:
        op.add_column('processing_runs', sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True))
        op.execute(
            """
            UPDATE processing_runs
            SET user_id = processes.user_id
            FROM processes
            WHERE processing_runs.process_id = processes.id
            """
        )
        op.alter_column('processing_runs', 'user_id', nullable=False)
        op.create_foreign_key(
            'fk_processing_runs_user_id',
            'processing_runs',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )
        op.create_index('ix_processing_runs_user_id', 'processing_runs', ['user_id'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'processing_runs' in tables:
        run_columns = {column['name'] for column in inspector.get_columns('processing_runs')}
        if 'user_id' in run_columns:
            op.drop_index('ix_processing_runs_user_id', table_name='processing_runs')
            op.drop_constraint('fk_processing_runs_user_id', 'processing_runs', type_='foreignkey')
            op.drop_column('processing_runs', 'user_id')

    if 'processes' in tables:
        process_columns = {column['name'] for column in inspector.get_columns('processes')}
        if 'user_id' in process_columns:
            op.drop_index('ix_processes_user_id', table_name='processes')
            op.drop_constraint('fk_processes_user_id', 'processes', type_='foreignkey')
            op.drop_column('processes', 'user_id')

    if 'users' in tables:
        op.drop_index('ix_users_username', table_name='users')
        op.drop_table('users')
        op.execute('DROP TYPE IF EXISTS userrole')
