from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy.orm import Session

from app.ai.policies import ToolPolicyError
from app.ai.tools.registry import ToolContext, ToolSpec
from app.models import Analysis
from app.superset.queries import validar_sql

MAX_NAME_LENGTH = 255


async def create_analysis(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Cria uma análise salva (escrita — exige confirmação do usuário).

    ``database_id``/``dataset_id`` vêm do escopo da sessão; ids informados
    pelo LLM só são aceitos se pertencerem ao escopo.
    """
    name = args.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ToolPolicyError("Argumento 'name' obrigatório para create_analysis.")
    name = name.strip()[:MAX_NAME_LENGTH]

    sql = args.get("sql")
    if sql is not None:
        if not isinstance(sql, str):
            raise ToolPolicyError("Argumento 'sql' inválido.")
        try:
            validar_sql(sql)
        except ValueError as exc:
            raise ToolPolicyError(str(exc)) from exc

    dataset_id = _scoped_or_none(ctx, args.get("dataset_id"), "dataset")
    database_id = _scoped_or_none(ctx, args.get("database_id"), "database")

    description = _optional_str(args.get("description"), 4000)
    chart_type = _optional_str(args.get("chart_type"), 100)
    dimension = _optional_str(args.get("dimension"), 255)
    metric = _optional_str(args.get("metric"), 255)
    db_schema = _optional_str(args.get("db_schema"), 255)

    if ctx.db is None:
        raise RuntimeError("Sessão de banco indisponível para a tool.")

    analysis_id = await asyncio.to_thread(
        _persist,
        ctx.db,
        {
            "name": name,
            "description": description,
            "sql": sql,
            "database_id": database_id,
            "db_schema": db_schema,
            "dataset_id": dataset_id,
            "chart_type": chart_type,
            "dimension": dimension,
            "metric": metric,
            "created_by": ctx.user_id,
        },
    )
    return {
        "analysisId": str(analysis_id),
        "name": name,
        "created": True,
    }


def _persist(db: Session, data: dict[str, Any]) -> Any:
    analysis = Analysis(**data)
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis.id


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolPolicyError(f"Identificador inválido: {value!r}")
    return value


def _scoped_or_none(ctx: ToolContext, requested: Any, label: str) -> int | None:
    """Resolve um id do escopo; id vindo do LLM fora do escopo é negado.

    Sem id informado e com um único candidato no escopo, usa o escopo.
    Sem escopo (ou vários candidatos) o campo fica ``None`` — a análise é
    criada sem a referência, em vez de adivinhar.
    """
    value = _optional_int(requested)
    allowed = ctx.policy.scope.dataset_ids if label == "dataset" else ctx.policy.scope.database_ids
    if value is None:
        if len(allowed) == 1:
            return next(iter(allowed))
        return None
    if allowed and value not in allowed:
        raise ToolPolicyError(f"{label}_id {value} está fora do escopo desta sessão.")
    if not allowed:
        return None
    return value


def _optional_str(value: Any, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolPolicyError(f"Valor inválido: {value!r}")
    value = value.strip()
    return value[:max_length] or None


def create_analysis_spec() -> ToolSpec:
    return ToolSpec(
        name="create_analysis",
        description=(
            "Salva a consulta atual como uma Análise reutilizável do usuário. "
            "Exige confirmação explícita do usuário antes de executar."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "maxLength": MAX_NAME_LENGTH},
                "description": {"type": "string"},
                "sql": {"type": "string", "description": "SELECT/WITH da análise."},
                "chart_type": {"type": "string"},
                "dimension": {"type": "string"},
                "metric": {"type": "string"},
                "db_schema": {"type": "string"},
                "dataset_id": {"type": "integer"},
                "database_id": {"type": "integer"},
            },
            "required": ["name"],
            "additionalProperties": False,
        },
        handler=create_analysis,
        requires_confirmation=True,
        allowed_agents=frozenset({"explorer"}),
    )
