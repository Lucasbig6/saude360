"""Dashboard widgets v2: config do widget em JSONB.

Coluna ``widget`` guarda a configuração v2 (chart/table/kpi/text/image).
Linhas existentes são derivadas da análise legada
(``chart_type``/``dimension``/``metric``), espelhando o
``legacyToChartConfig`` do frontend.

Revision ID: 0004_dashboard_widgets_v2
Revises: 0003_ai_sessions
Create Date: 2026-09-29

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_dashboard_widgets_v2"
down_revision: Union[str, None] = "0003_ai_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKFILL = """
UPDATE dashboard_widgets AS w
SET widget = CASE
    WHEN a.chart_type = 'table' THEN
        jsonb_build_object('type', 'table')
    ELSE
        jsonb_build_object(
            'type',
            CASE
                WHEN a.chart_type IN (
                    'bar', 'line', 'area', 'pie', 'donut', 'scatter',
                    'radar', 'gauge', 'funnel', 'heatmap', 'treemap'
                ) THEN a.chart_type
                ELSE 'bar'
            END,
            'legend', true,
            'tooltip', true
        )
        || COALESCE(
            CASE
                WHEN a.dimension IS NULL AND a.metric IS NULL THEN NULL
                ELSE jsonb_build_object(
                    'encoding',
                    jsonb_strip_nulls(jsonb_build_object(
                        'x', a.dimension,
                        'y', a.metric
                    ))
                )
            END,
            '{}'::jsonb
        )
END
FROM analyses AS a
WHERE a.id = w.analysis_id
  AND w.widget = '{}'::jsonb
"""


def upgrade() -> None:
    op.add_column(
        "dashboard_widgets",
        sa.Column(
            "widget",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.execute(_BACKFILL)


def downgrade() -> None:
    op.drop_column("dashboard_widgets", "widget")
