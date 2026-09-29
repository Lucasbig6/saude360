from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.policies import ToolPolicyError
from app.ai.tools.registry import ToolContext, ToolSpec
from app.models import Analysis, Dashboard, DashboardFilter, Project


async def get_dashboard_context(
    ctx: ToolContext, args: dict[str, Any]
) -> dict[str, Any]:
    """Contexto estrutural do dashboard da sessão.

    Contrato idêntico ao ``DashboardAnalysisContext`` do frontend
    (``frontend/lib/dashboard-analysis-context.ts``) — mais os filtros.
    O dashboard vem do escopo da sessão: um ``dashboard_id`` vindo do LLM
    é ignorado por definição.
    """
    dashboard_id = ctx.policy.scope.dashboard_id
    if dashboard_id is None:
        raise ToolPolicyError("Sessão sem dashboard associado.")
    if ctx.db is None:
        raise RuntimeError("Sessão de banco indisponível para a tool.")
    return await asyncio.to_thread(_load_context, ctx.db, dashboard_id)


def _load_context(db: Session, dashboard_id: uuid.UUID) -> dict[str, Any]:
    dashboard = db.scalar(select(Dashboard).where(Dashboard.id == dashboard_id))
    if dashboard is None:
        raise ToolPolicyError("Dashboard não encontrado para esta sessão.")

    project: dict[str, Any] | None = None
    if dashboard.project_id is not None:
        row = db.scalar(select(Project).where(Project.id == dashboard.project_id))
        if row is not None:
            project = {"id": str(row.id), "name": row.name}

    analysis_ids = [widget.analysis_id for widget in dashboard.widgets]
    analyses: dict[uuid.UUID, Analysis] = {}
    if analysis_ids:
        rows = db.scalars(select(Analysis).where(Analysis.id.in_(analysis_ids))).all()
        analyses = {row.id: row for row in rows}

    widgets: list[dict[str, Any]] = []
    for widget in dashboard.widgets:
        analysis = analyses.get(widget.analysis_id)
        if analysis is None:
            continue
        widgets.append(
            {
                "id": str(widget.id),
                "analysisId": str(analysis.id),
                "title": analysis.name,
                "chartType": analysis.chart_type,
                "datasetId": analysis.dataset_id,
                "databaseId": analysis.database_id,
                "dbSchema": analysis.db_schema,
                "dimension": analysis.dimension,
                "metric": analysis.metric,
                "sql": analysis.sql,
                "widget": widget.widget or {},
            }
        )

    filters = [_filter_dto(row) for row in dashboard.filters]

    return {
        "dashboard": {
            "id": str(dashboard.id),
            "name": dashboard.name,
            "description": dashboard.description,
        },
        "project": project,
        "widgets": widgets,
        "filters": filters,
    }


def _filter_dto(row: DashboardFilter) -> dict[str, Any]:
    return {
        "datasetId": row.dataset_id,
        "column": row.column_name,
        "operator": row.operator,
        "defaultValue": row.default_value,
        "scope": row.scope,
    }


def dashboard_context_spec() -> ToolSpec:
    return ToolSpec(
        name="get_dashboard_context",
        description=(
            "Retorna a estrutura do painel atual: widgets (análises com SQL, "
            "dimensão, métrica, dataset e database) e filtros. Use antes de "
            "qualquer pergunta sobre o painel."
        ),
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        handler=get_dashboard_context,
        allowed_agents=frozenset({"dashboard_copilot"}),
    )
