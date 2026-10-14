from __future__ import annotations

import time
from typing import Any

from app.ai.policies import ToolPolicyError
from app.ai.tools.queries import normalize_result
from app.ai.tools.registry import ToolContext, ToolSpec, nullable
from app.superset import queries as superset_queries

MAX_FILTERS = 20
MAX_SORT_LENGTH = 255
MAX_LIMIT = 5000

#: Tipos plotáveis no explorador (13 gráficos + kpi; tabela é viewMode).
CHART_TYPES = frozenset(
    {
        "bar",
        "bar-horizontal",
        "line",
        "area",
        "pie",
        "donut",
        "scatter",
        "radar",
        "gauge",
        "funnel",
        "heatmap",
        "treemap",
        "map",
        "kpi",
    }
)

#: Operadores informativos dos filtros — o dado já vem filtrado pelo WHERE
#: da SQL validada; o filtro documenta a intenção (chips + chart_config).
FILTER_OPERATORS = frozenset(
    {
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "not-in",
        "between",
        "like",
        "contains",
        "is-null",
        "not-null",
    }
)


async def preview_analysis(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Executa a análise atual e devolve config estruturada + dados atômicos.

    Somente leitura (sem confirmação): valida a SQL pelo mesmo mecanismo
    autorizado do ``execute_query`` (SELECT/WITH, banco do escopo) e devolve
    ``config`` (o contrato agente→frontend) junto do resultado — o frontend
    só atualiza a pré-visualização quando os dois chegam juntos.

    Os ``filters`` são informativos: documentam a restrição aplicada no WHERE
    da SQL (chips + persistência em ``chart_config``); valores não são
    injetados na consulta pela tool.
    """
    sql = args.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise ToolPolicyError("Argumento 'sql' ausente ou inválido.")

    try:
        superset_queries.validar_sql(sql)
    except ValueError as exc:
        raise ToolPolicyError(str(exc)) from exc

    config = {
        "sql": sql.strip(),
        "chartType": _chart_type(args.get("chart_type")),
        "dimension": parse_optional_str(args.get("dimension"), MAX_SORT_LENGTH),
        "metric": parse_optional_str(args.get("metric"), MAX_SORT_LENGTH),
        "colorField": parse_optional_str(args.get("color_field"), MAX_SORT_LENGTH),
        "sort": parse_sort(args.get("sort")),
        "limit": parse_limit(args.get("limit")),
        "filters": parse_filters(args.get("filters")),
        "showValues": parse_optional_bool(args.get("show_values")),
    }

    database_id = ctx.policy.enforce_database(_optional_int(args.get("database_id")))

    schema = args.get("db_schema")
    if schema is not None and not isinstance(schema, str):
        raise ToolPolicyError("Argumento 'db_schema' inválido.")

    started = time.perf_counter()
    payload = await superset_queries.execute_query(
        database_id=database_id,
        sql=sql,
        schema=schema,
    )
    execution_ms = int((time.perf_counter() - started) * 1000)

    if isinstance(payload, dict) and payload.get("status") not in (None, "success"):
        message = payload.get("error") or payload.get("message") or payload.get("status")
        raise RuntimeError(f"Falha na consulta: {message}")

    data = normalize_result(
        payload,
        execution_ms=execution_ms,
        max_rows=ctx.policy.max_rows,
        database_id=database_id,
    )
    return {"config": config, "data": data}


def _chart_type(value: Any) -> str:
    if value is None:
        return "bar"
    if not isinstance(value, str) or value not in CHART_TYPES:
        raise ToolPolicyError(
            f"chart_type inválido: {value!r}. Use um de: {sorted(CHART_TYPES)}."
        )
    return value


def parse_sort(value: Any) -> dict[str, str] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ToolPolicyError("Argumento 'sort' inválido.")
    field = value.get("field")
    direction = value.get("direction")
    if not isinstance(field, str) or not field.strip():
        raise ToolPolicyError("Argumento 'sort.field' ausente ou inválido.")
    if direction not in ("asc", "desc"):
        raise ToolPolicyError("Argumento 'sort.direction' deve ser 'asc' ou 'desc'.")
    return {"field": field.strip()[:MAX_SORT_LENGTH], "direction": direction}


def parse_limit(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolPolicyError(f"Argumento 'limit' inválido: {value!r}.")
    if value < 1 or value > MAX_LIMIT:
        raise ToolPolicyError(f"Argumento 'limit' deve estar entre 1 e {MAX_LIMIT}.")
    return value


def parse_optional_bool(value: Any) -> bool | None:
    """Booleano opcional (``show_values``): ``None`` = manter o atual."""
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ToolPolicyError(f"Argumento booleano inválido: {value!r}.")
    return value


def parse_filters(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ToolPolicyError("Argumento 'filters' inválido.")
    if len(value) > MAX_FILTERS:
        raise ToolPolicyError(f"Argumento 'filters' excede o máximo de {MAX_FILTERS}.")
    filters: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ToolPolicyError("Filtro inválido (esperado objeto).")
        field = item.get("field")
        operator = item.get("operator")
        if not isinstance(field, str) or not field.strip():
            raise ToolPolicyError("Filtro sem 'field' válido.")
        if operator not in FILTER_OPERATORS:
            raise ToolPolicyError(
                f"Filtro com operador inválido: {operator!r}. "
                f"Use um de: {sorted(FILTER_OPERATORS)}."
            )
        filters.append(
            {
                "field": field.strip()[:MAX_SORT_LENGTH],
                "operator": operator,
                "value": _filter_value(item.get("value")),
            }
        )
    return filters


def _filter_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        if len(value) > 50:
            raise ToolPolicyError("Filtro com lista de valores muito longa.")
        for entry in value:
            if entry is not None and not isinstance(entry, (str, int, float, bool)):
                raise ToolPolicyError("Valor de filtro inválido.")
        return value
    raise ToolPolicyError(f"Valor de filtro inválido: {value!r}")


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolPolicyError(f"Identificador inválido: {value!r}")
    return value


def parse_optional_str(value: Any, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolPolicyError(f"Valor inválido: {value!r}")
    value = value.strip()
    return value[:max_length] or None


def preview_analysis_spec() -> ToolSpec:
    return ToolSpec(
        name="preview_analysis",
        description=(
            "Executa a análise atual e retorna a configuração estruturada "
            "(tipo de gráfico, dimensão, métrica, cor, ordenação, limite, "
            "filtros e rótulos de valor) junto dos dados. Use para CRIAR uma "
            "análise ou MODIFICAR a que está em edição: envie a configuração "
            "completa alterando somente o que o usuário pediu e preserve os "
            "demais atributos. Somente leitura; não pede confirmação."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Consulta SELECT/WITH da análise (com o WHERE já aplicado).",
                },
                "chart_type": nullable(
                    {
                        "type": "string",
                        "enum": sorted(CHART_TYPES),
                        "description": "Tipo de visualização (omitir/null = manter 'bar').",
                    }
                ),
                "dimension": nullable(
                    {"type": "string", "description": "Coluna da dimensão (eixo/categoria)."}
                ),
                "metric": nullable(
                    {"type": "string", "description": "Coluna da métrica (valor agregado)."}
                ),
                "color_field": nullable(
                    {"type": "string", "description": "Coluna de cores/séries (opcional)."}
                ),
                "sort": nullable(
                    {
                        "type": "object",
                        "properties": {
                            "field": {"type": "string"},
                            "direction": {"type": "string", "enum": ["asc", "desc"]},
                        },
                        "required": ["field", "direction"],
                        "additionalProperties": False,
                        "description": "Ordenação exibida no gráfico.",
                    }
                ),
                "limit": nullable(
                    {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_LIMIT,
                        "description": "Limite de categorias exibidas.",
                    }
                ),
                "filters": nullable(
                    {
                        "type": "array",
                        "maxItems": MAX_FILTERS,
                        "description": (
                            "Filtros informativos aplicados no WHERE da SQL "
                            "(documentam a restrição exibida como chips)."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {"type": "string"},
                                "operator": {"type": "string", "enum": sorted(FILTER_OPERATORS)},
                                "value": {},
                            },
                            "required": ["field", "operator"],
                            "additionalProperties": False,
                        },
                    }
                ),
                "show_values": nullable(
                    {
                        "type": "boolean",
                        "description": (
                            "Exibe rótulos de valor nas barras/pizza "
                            "(omitir/null = manter os atuais)."
                        ),
                    }
                ),
                "db_schema": nullable(
                    {
                        "type": "string",
                        "description": "Schema do banco (opcional; omita se não souber).",
                    }
                ),
                "database_id": nullable(
                    {
                        "type": "integer",
                        "description": (
                            "Opcional: só é aceito se estiver no escopo "
                            "da sessão; omita se não souber."
                        ),
                    }
                ),
            },
            "required": ["sql"],
            "additionalProperties": False,
        },
        handler=preview_analysis,
        allowed_agents=frozenset({"explorer"}),
    )
