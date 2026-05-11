"""add user_pic table

Revision ID: d9e3f1a2b4c5
Revises: c8d2e1f0a9b3
Create Date: 2026-05-11 12:00:00.000000

"""

from alembic import op


revision = "d9e3f1a2b4c5"
down_revision = "c8d2e1f0a9b3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_pic (
            user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            picture BYTEA NOT NULL
        )
        """
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS user_pic")
