"""AI sessions, messages and tool calls.

Revision ID: 0003_ai_sessions
Revises: 0002_projects
Create Date: 2026-09-29

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_ai_sessions"
down_revision: Union[str, None] = "0002_projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_sessions",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("user_id", postgresql.UUID(), nullable=True),
        sa.Column("agent_type", sa.String(length=50), nullable=False),
        sa.Column("dashboard_id", postgresql.UUID(), nullable=True),
        sa.Column("dataset_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("model", sa.String(length=150), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_ai_sessions_user_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["dashboard_id"],
            ["dashboards.id"],
            name="fk_ai_sessions_dashboard_id_dashboards",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_sessions"),
    )
    op.create_index("ix_ai_sessions_user_id", "ai_sessions", ["user_id"])
    op.create_index("ix_ai_sessions_dashboard_id", "ai_sessions", ["dashboard_id"])

    op.create_table(
        "ai_messages",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("session_id", postgresql.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("tool_call_id", sa.String(length=100), nullable=True),
        sa.Column("tool_name", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ai_sessions.id"],
            name="fk_ai_messages_session_id_ai_sessions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_messages"),
    )
    op.create_index("ix_ai_messages_session_id", "ai_messages", ["session_id"])
    op.create_index(
        "ix_ai_messages_session_id_created_at",
        "ai_messages",
        ["session_id", "created_at"],
    )

    op.create_table(
        "ai_tool_calls",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("session_id", postgresql.UUID(), nullable=False),
        sa.Column("message_id", postgresql.UUID(), nullable=True),
        sa.Column("tool_call_id", sa.String(length=100), nullable=True),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column(
            "arguments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ai_sessions.id"],
            name="fk_ai_tool_calls_session_id_ai_sessions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["ai_messages.id"],
            name="fk_ai_tool_calls_message_id_ai_messages",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_tool_calls"),
    )
    op.create_index("ix_ai_tool_calls_session_id", "ai_tool_calls", ["session_id"])
    op.create_index(
        "ix_ai_tool_calls_tool_call_id", "ai_tool_calls", ["tool_call_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_ai_tool_calls_tool_call_id", table_name="ai_tool_calls")
    op.drop_index("ix_ai_tool_calls_session_id", table_name="ai_tool_calls")
    op.drop_table("ai_tool_calls")

    op.drop_index("ix_ai_messages_session_id_created_at", table_name="ai_messages")
    op.drop_index("ix_ai_messages_session_id", table_name="ai_messages")
    op.drop_table("ai_messages")

    op.drop_index("ix_ai_sessions_dashboard_id", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_user_id", table_name="ai_sessions")
    op.drop_table("ai_sessions")
