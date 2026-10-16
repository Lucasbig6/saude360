"""Persist dashboard filter control types.

Revision ID: 0009_filter_controls
Revises: 0008_independent_widgets
Create Date: 2026-10-16
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0009_filter_controls"
down_revision: Union[str, None] = "0008_independent_widgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dashboard_filters",
        sa.Column(
            "control_type",
            sa.String(length=20),
            nullable=False,
            server_default="dropdown",
        ),
    )


def downgrade() -> None:
    op.drop_column("dashboard_filters", "control_type")