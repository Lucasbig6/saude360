"""projects

Revision ID: 0002_projects
Revises: 0001_initial
Create Date: 2026-09-26

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_projects"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(), nullable=True),
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
            ["created_by"],
            ["users.id"],
            name="fk_projects_created_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
    )

    op.add_column("analyses", sa.Column("project_id", postgresql.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_analyses_project_id_projects",
        "analyses",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_analyses_project_id", "analyses", ["project_id"])

    op.add_column(
        "dashboards", sa.Column("project_id", postgresql.UUID(), nullable=True)
    )
    op.create_foreign_key(
        "fk_dashboards_project_id_projects",
        "dashboards",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_dashboards_project_id", "dashboards", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_dashboards_project_id", table_name="dashboards")
    op.drop_constraint(
        "fk_dashboards_project_id_projects", "dashboards", type_="foreignkey"
    )
    op.drop_column("dashboards", "project_id")

    op.drop_index("ix_analyses_project_id", table_name="analyses")
    op.drop_constraint(
        "fk_analyses_project_id_projects", "analyses", type_="foreignkey"
    )
    op.drop_column("analyses", "project_id")

    op.drop_table("projects")
