from __future__ import annotations

import time
from typing import Any

from app.ai.policies import ToolPolicyError
from app.ai.tools.registry import ToolContext, ToolSpec
from app.superset import queries as superset_queries


async def execute_query(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Executa um SELECT/WITH no banco da sessão (mesmo caminho do SIGDATA).

    Segurança (não depende do prompt):
    - ``validar_sql`` do Superset: só SELECT/WITH, sem comentários malformados;
    - fontes criadas com ``allow_dml=False`` no Superset;
    - ``database_id`` resolvido pelo escopo da policy (um id vindo do LLM
      só é aceito se pertencer ao escopo);
    - timeout de execução (policy);
    - ``max_rows`` aplicado no retorno (truncamento + metadados), sem
      exigir LIMIT literal no SQL.
    """
    sql = args.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise ToolPolicyError("Argumento 'sql' ausente ou inválido.")

    try:
        superset_queries.validar_sql(sql)
    except ValueError as exc:
        raise ToolPolicyError(str(exc)) from exc

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

    return _normalize_result(
        payload,
        execution_ms=execution_ms,
        max_rows=ctx.policy.max_rows,
        database_id=database_id,
    )


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolPolicyError(f"Identificador inválido: {value!r}")
    return value


def _normalize_result(
    payload: Any,
    *,
    execution_ms: int,
    max_rows: int,
    database_id: int,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}

    raw_rows = payload.get("data")
    rows = raw_rows if isinstance(raw_rows, list) else []

    columns = payload.get("colnames")
    if not isinstance(columns, list) or not columns:
        columns = _columns_from_rows(rows)

    row_count = len(rows)
    truncated = row_count > max_rows

    return {
        "databaseId": database_id,
        "columns": columns,
        "rows": rows[:max_rows],
        "rowCount": row_count,
        "truncated": truncated,
        "executionMs": execution_ms,
    }


def _columns_from_rows(rows: list[Any]) -> list[Any]:
    if rows and isinstance(rows[0], dict):
        return list(rows[0].keys())
    return []


def execute_query_spec() -> ToolSpec:
    return ToolSpec(
        name="execute_query",
        description=(
            "Executa uma consulta de leitura (SELECT/WITH) no banco da sessão "
            "e retorna colunas, linhas e metadados de execução. Não use DML."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Consulta SELECT ou WITH.",
                },
                "db_schema": {
                    "type": "string",
                    "description": "Schema do banco (opcional).",
                },
                "database_id": {
                    "type": "integer",
                    "description": (
                        "Opcional: só é aceito se estiver no escopo da sessão."
                    ),
                },
            },
            "required": ["sql"],
            "additionalProperties": False,
        },
        handler=execute_query,
        allowed_agents=frozenset({"dashboard_copilot", "explorer"}),
    )
