"""Allow dashboard widgets without an analysis.

Revision ID: 0008_independent_widgets
Revises: 0007_dashboard_pages
Create Date: 2026-10-16
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0008_independent_widgets"
down_revision: Union[str, None] = "0007_dashboard_pages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_dashboard_widgets_analysis_id_analyses",
        "dashboard_widgets",
        type_="foreignkey",
    )
    op.alter_column(
        "dashboard_widgets",
        "analysis_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_dashboard_widgets_analysis_id_analyses",
        "dashboard_widgets",
        "analyses",
        ["analysis_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute("DELETE FROM dashboard_widgets WHERE analysis_id IS NULL")
    op.drop_constraint(
        "fk_dashboard_widgets_analysis_id_analyses",
        "dashboard_widgets",
        type_="foreignkey",
    )
    op.alter_column(
        "dashboard_widgets",
        "analysis_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_dashboard_widgets_analysis_id_analyses",
        "dashboard_widgets",
        "analyses",
        ["analysis_id"],
        ["id"],
        ondelete="CASCADE",
    )