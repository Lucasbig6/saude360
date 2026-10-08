from __future__ import annotations

from typing import Any

from app.ai.policies import ToolPolicyError
from app.ai.tools.registry import ToolContext, ToolSpec, nullable
from app.superset import datasets as superset_datasets
from app.superset.filters import COLUMN_NAME_PATTERN

MAX_COLUMN_VALUES = 500


async def get_dataset_schema(
    ctx: ToolContext, args: dict[str, Any]
) -> dict[str, Any]:
    """Schema (colunas) de um dataset do escopo da sessão."""
    dataset_id = ctx.policy.enforce_dataset(_optional_int(args.get("dataset_id")))
    result = await superset_datasets.get_dataset_columns(dataset_id)
    return _normalize_schema(dataset_id, result)


async def get_column_values(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Valores distintos de uma coluna (para filtros/ordenamento)."""
    dataset_id = ctx.policy.enforce_dataset(_optional_int(args.get("dataset_id")))
    column_name = args.get("column_name")
    if not isinstance(column_name, str) or not COLUMN_NAME_PATTERN.match(column_name):
        raise ToolPolicyError(f"Nome de coluna inválido: {column_name!r}")
    limit = _clamp_limit(args.get("limit"))
    result = await superset_datasets.get_distinct_values(dataset_id, column_name)
    values = result.get("result") if isinstance(result, dict) else None
    if not isinstance(values, list):
        values = []
    return {
        "datasetId": dataset_id,
        "column": column_name,
        "values": values[:limit],
        "count": len(values[:limit]),
        "truncated": len(values) > limit,
    }


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolPolicyError(f"Identificador inválido: {value!r}")
    return value


def _clamp_limit(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        return 50
    return max(1, min(value, MAX_COLUMN_VALUES))


def _normalize_schema(dataset_id: int, payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}
    raw_columns = payload.get("columns")
    columns: list[dict[str, Any]] = []
    if isinstance(raw_columns, list):
        for column in raw_columns:
            if not isinstance(column, dict):
                continue
            columns.append(
                {
                    "name": column.get("column_name"),
                    "type": column.get("type"),
                    "isDttm": bool(column.get("is_dttm")),
                }
            )
    database = payload.get("database")
    return {
        "datasetId": dataset_id,
        "table": payload.get("table_name"),
        "schema": payload.get("schema"),
        "databaseId": database.get("id") if isinstance(database, dict) else None,
        "columns": columns,
    }


def dataset_schema_spec() -> ToolSpec:
    return ToolSpec(
        name="get_dataset_schema",
        description=(
            "Retorna as colunas (nome e tipo) de um dataset do escopo da "
            "sessão. Informe dataset_id apenas se houver mais de um no escopo."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "dataset_id": nullable(
                    {
                        "type": "integer",
                        "description": (
                            "ID do dataset (opcional se houver apenas um "
                            "no escopo; omita se não souber)."
                        ),
                    }
                )
            },
            "additionalProperties": False,
        },
        handler=get_dataset_schema,
        allowed_agents=frozenset({"dashboard_copilot", "explorer"}),
    )


def column_values_spec() -> ToolSpec:
    return ToolSpec(
        name="get_column_values",
        description=(
            "Lista valores distintos de uma coluna de um dataset do escopo "
            "da sessão (útil antes de filtrar ou agrupar)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "dataset_id": nullable({"type": "integer"}),
                "column_name": {"type": "string"},
                "limit": nullable(
                    {"type": "integer", "minimum": 1, "maximum": MAX_COLUMN_VALUES}
                ),
            },
            "required": ["column_name"],
            "additionalProperties": False,
        },
        handler=get_column_values,
        allowed_agents=frozenset({"dashboard_copilot", "explorer"}),
    )
