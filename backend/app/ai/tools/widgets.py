from __future__ import annotations

import asyncio
import uuid
from typing import Any

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.policies import ToolPolicyError
from app.ai.tools.registry import ToolContext, ToolSpec
from app.models import DashboardWidget
from app.schemas.dashboards import WidgetConfigIn

_widget_config_adapter = TypeAdapter(WidgetConfigIn)


async def update_widget_config(
    ctx: ToolContext, args: dict[str, Any]
) -> dict[str, Any]:
    """Atualiza a config de um widget do painel da sessão (escrita).

    O ``widget_id`` é apenas um pedido: só vale se o widget pertencer ao
    dashboard do escopo da sessão. A config é validada pelo mesmo schema
    ``WidgetConfigIn`` usado pela API de dashboards.
    """
    widget_id = _parse_uuid(args.get("widget_id"), "widget_id")

    config_raw = args.get("config")
    if not isinstance(config_raw, dict):
        raise ToolPolicyError(
            "Argumento 'config' (objeto) obrigatório para update_widget_config."
        )
    try:
        config = _widget_config_adapter.validate_python(config_raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        raise ToolPolicyError(
            f"config inválida em {location}: {first['msg']}"
        ) from exc

    if ctx.policy.scope.dashboard_id is None:
        raise ToolPolicyError("Sessão sem dashboard associado.")
    if ctx.db is None:
        raise RuntimeError("Sessão de banco indisponível para a tool.")

    payload = config.model_dump(mode="json", exclude_none=True)
    analysis_id = await asyncio.to_thread(
        _persist, ctx.db, widget_id, ctx.policy.scope.dashboard_id, payload
    )
    return {
        "widgetId": str(widget_id),
        "analysisId": str(analysis_id),
        "widget": payload,
        "updated": True,
    }


def _persist(
    db: Session,
    widget_id: uuid.UUID,
    dashboard_id: uuid.UUID,
    payload: dict[str, Any],
) -> uuid.UUID:
    row = db.scalar(
        select(DashboardWidget).where(
            DashboardWidget.id == widget_id,
            DashboardWidget.dashboard_id == dashboard_id,
        )
    )
    if row is None:
        raise ToolPolicyError(
            "Widget não encontrado no painel desta sessão."
        )
    row.widget = payload
    db.commit()
    return row.analysis_id


def _parse_uuid(value: Any, label: str) -> uuid.UUID:
    if not isinstance(value, str) or not value.strip():
        raise ToolPolicyError(
            f"Argumento '{label}' obrigatório para update_widget_config."
        )
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ToolPolicyError(f"{label} inválido: {value!r}") from exc


def update_widget_config_spec() -> ToolSpec:
    return ToolSpec(
        name="update_widget_config",
        description=(
            "Atualiza a configuração de um widget do painel atual (tipo de "
            "gráfico, campos encoding, limites, título etc.). Use "
            "get_dashboard_context antes para obter o id dos widgets. Exige "
            "confirmação explícita do usuário antes de executar."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "widget_id": {
                    "type": "string",
                    "description": "Id (uuid) do widget, conforme get_dashboard_context.",
                },
                "config": {
                    "type": "object",
                    "description": (
                        "Nova config do widget: type (bar/line/pie/... ou "
                        "table/kpi/text/image) mais os campos do tipo."
                    ),
                },
            },
            "required": ["widget_id", "config"],
            "additionalProperties": False,
        },
        handler=update_widget_config,
        requires_confirmation=True,
        allowed_agents=frozenset({"dashboard_copilot"}),
    )
