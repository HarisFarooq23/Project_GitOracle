"""add user_activity table

Revision ID: c8d2e1f0a9b3
Revises: f41a9d92c0b1
Create Date: 2026-05-10 12:00:00.000000

"""
from alembic import op


revision = "c8d2e1f0a9b3"
down_revision = "f41a9d92c0b1"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_activity (
            activity_id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            entered_webapp_at TIMESTAMP NOT NULL DEFAULT NOW(),
            left_webapp_at TIMESTAMP
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_activity_entered ON user_activity(user_id, entered_webapp_at DESC)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS user_activity")
