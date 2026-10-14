"""Páginas de dashboard (abas da barra inferior).

Separa o layout em páginas: ``dashboard_pages`` guarda nome/ordem e cada
widget ganha ``page_id`` (NULL = dashboard legado sem páginas explícitas —
o frontend sintetiza a "Página 1" e ela é materializada na primeira
edição). ``dashboards.active_page_id`` persiste a página exibida ao abrir
o painel (inclusive no link compartilhado).

Migração somente de schema: nenhum dado é criado ou reescrito.

Revision ID: 0007_dashboard_pages
Revises: 0006_project_sources
Create Date: 2026-10-14

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007_dashboard_pages"
down_revision: Union[str, None] = "0006_project_sources"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_pages",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("dashboard_id", postgresql.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["dashboard_id"],
            ["dashboards.id"],
            name="fk_dashboard_pages_dashboard_id_dashboards",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_pages"),
    )
    op.create_index(
        "ix_dashboard_pages_dashboard_id", "dashboard_pages", ["dashboard_id"]
    )

    op.add_column(
        "dashboard_widgets", sa.Column("page_id", postgresql.UUID(), nullable=True)
    )
    op.create_foreign_key(
        "fk_dashboard_widgets_page_id_dashboard_pages",
        "dashboard_widgets",
        "dashboard_pages",
        ["page_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_dashboard_widgets_page_id", "dashboard_widgets", ["page_id"]
    )

    op.add_column(
        "dashboards", sa.Column("active_page_id", postgresql.UUID(), nullable=True)
    )
    op.create_foreign_key(
        "fk_dashboards_active_page_id_dashboard_pages",
        "dashboards",
        "dashboard_pages",
        ["active_page_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_dashboards_active_page_id_dashboard_pages",
        "dashboards",
        type_="foreignkey",
    )
    op.drop_column("dashboards", "active_page_id")

    op.drop_index("ix_dashboard_widgets_page_id", table_name="dashboard_widgets")
    op.drop_constraint(
        "fk_dashboard_widgets_page_id_dashboard_pages",
        "dashboard_widgets",
        type_="foreignkey",
    )
    op.drop_column("dashboard_widgets", "page_id")

    op.drop_index("ix_dashboard_pages_dashboard_id", table_name="dashboard_pages")
    op.drop_table("dashboard_pages")
