"""Ligação projeto ↔ fonte de dados.

As fontes de dados são databases do Superset (id inteiro) — não há FK local.
``project_sources`` indexa quais fontes pertencem a cada projeto, permitindo
``GET /api/sources?projectId=`` sem alterar o Superset.

Revision ID: 0006_project_sources
Revises: 0005_analysis_chart_config
Create Date: 2026-10-06

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006_project_sources"
down_revision: Union[str, None] = "0005_analysis_chart_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_sources",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("project_id", postgresql.UUID(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_project_sources_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_sources"),
        sa.UniqueConstraint(
            "project_id", "source_id", name="uq_project_sources_project_source"
        ),
    )
    op.create_index(
        "ix_project_sources_project_id", "project_sources", ["project_id"]
    )
    op.create_index("ix_project_sources_source_id", "project_sources", ["source_id"])


def downgrade() -> None:
    op.drop_index("ix_project_sources_source_id", table_name="project_sources")
    op.drop_index("ix_project_sources_project_id", table_name="project_sources")
    op.drop_table("project_sources")
