from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_token
from app.db.session import get_db
from app.models import Analysis
from app.models.dashboard import DashboardWidget
from app.superset import queries as superset_queries
from app.superset.errors import extract_superset_error
from app.superset.filters import (
    FilterClause,
    build_where_clause,
    inject_where_clause,
)

router = APIRouter(prefix="/queries", tags=["Queries"])


def _error_response(e: Exception) -> JSONResponse:
    if isinstance(e, httpx.HTTPStatusError):
        detail = extract_superset_error(e) or "Erro ao executar a consulta no Superset."
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": detail, "detail": detail},
        )
    if isinstance(e, httpx.HTTPError):
        msg = "Não foi possível conectar ao Superset."
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": msg, "detail": msg},
        )
    msg = str(e) or "Erro interno ao executar a consulta."
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": msg, "detail": msg},
    )


class ExecuteQueryRequest(BaseModel):
    database_id: int
    sql: str
    db_schema: str | None = None
    # Opcional: limita o número de linhas retornadas (pré-visualizações).
    limit: int | None = None


@router.post("/execute")
async def execute_query(
    request: ExecuteQueryRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_queries.execute_query(
            database_id=request.database_id,
            sql=request.sql,
            schema=request.db_schema,
            limit=request.limit,
        )
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(e), "detail": str(e)},
        )
    except Exception as e:
        return _error_response(e)


class ExecuteFilteredQueryRequest(BaseModel):
    database_id: int
    sql: str
    db_schema: str | None = None
    filters: list[FilterClause] = []


@router.post("/execute-filtered")
async def execute_filtered_query(
    request: ExecuteFilteredQueryRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        if not request.filters:
            return await superset_queries.execute_query(
                database_id=request.database_id,
                sql=request.sql,
                schema=request.db_schema,
            )

        where_clause = build_where_clause(request.filters)
        filtered_sql = inject_where_clause(request.sql, where_clause)

        superset_queries.validar_sql(filtered_sql)

        return await superset_queries.execute_query(
            database_id=request.database_id,
            sql=filtered_sql,
            schema=request.db_schema,
        )
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(e), "detail": str(e)},
        )
    except Exception as e:
        return _error_response(e)


class FormatSqlRequest(BaseModel):
    sql: str


@router.post("/format")
async def format_sql(
    request: FormatSqlRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    return await superset_queries.format_sql(sql=request.sql)


class EstimateQueryRequest(BaseModel):
    database_id: int
    sql: str


@router.post("/estimate")
async def estimate_query(
    request: EstimateQueryRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    return await superset_queries.estimate_query(
        database_id=request.database_id,
        sql=request.sql,
    )


# ---------------------------------------------------------------------------
# Endpoints públicos (sem autenticação) — usados pelos painéis compartilhados
# ---------------------------------------------------------------------------


class PublicExecuteQueryRequest(BaseModel):
    """Execução sem token: requer que o analysis_id pertença a um dashboard."""

    analysis_id: uuid.UUID
    database_id: int
    sql: str
    db_schema: str | None = None
    filters: list[FilterClause] = []


@router.post("/execute-public")
async def execute_public_query(
    request: PublicExecuteQueryRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Executa a query de uma análise pertencente a um painel compartilhado.

    Validação de segurança: o ``analysis_id`` deve existir como widget em
    pelo menos um dashboard — caso contrário retorna 404.  Isso impede que
    usuários anônimos executem SQL arbitrário contra o Superset.
    """
    # Garante que a análise pertence a algum dashboard (painel compartilhado)
    widget_exists = db.scalar(
        select(DashboardWidget.id).where(
            DashboardWidget.analysis_id == request.analysis_id
        ).limit(1)
    )
    if widget_exists is None:
        raise HTTPException(
            status_code=404,
            detail="Análise não encontrada ou não vinculada a um painel público.",
        )

    try:
        if request.filters:
            where_clause = build_where_clause(request.filters)
            filtered_sql = inject_where_clause(request.sql, where_clause)
            superset_queries.validar_sql(filtered_sql)
            return await superset_queries.execute_query(
                database_id=request.database_id,
                sql=filtered_sql,
                schema=request.db_schema,
            )
        return await superset_queries.execute_query(
            database_id=request.database_id,
            sql=request.sql,
            schema=request.db_schema,
        )
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(e), "detail": str(e)},
        )
    except Exception as e:
        return _error_response(e)
