"""Chart config completa da análise em JSONB.

Coluna ``chart_config`` guarda a apresentação do gráfico editada no
Explorer (título, rótulos de eixo, formatação, cores, ordenação, limite...).
Os campos legados (``chart_type``/``dimension``/``metric``) continuam
populados em paralelo para retrocompatibilidade.

Revision ID: 0005_analysis_chart_config
Revises: 0004_dashboard_widgets_v2
Create Date: 2026-10-04

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_analysis_chart_config"
down_revision: Union[str, None] = "0004_dashboard_widgets_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analyses",
        sa.Column(
            "chart_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default=sa.text("NULL"),
        ),
    )


def downgrade() -> None:
    op.drop_column("analyses", "chart_config")
