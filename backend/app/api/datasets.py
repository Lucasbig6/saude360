from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth.dependencies import get_current_token
from app.superset import datasets as superset_datasets
from app.superset.materialize import materialize_query
from app.superset.naming import generate_table_name
from app.superset.queries import validar_sql

router = APIRouter(prefix="/datasets", tags=["Datasets"])


class CreateDatasetRequest(BaseModel):
    database_id: int
    table_name: str
    table_schema: str | None = None
    description: str | None = None


@router.get("")
async def list_datasets(
    page: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=200),
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    return await superset_datasets.list_datasets(page=page, page_size=page_size)


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: int | str,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_datasets.get_dataset(dataset_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{dataset_id}/columns")
async def get_dataset_columns(
    dataset_id: int,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_datasets.get_dataset_columns(dataset_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{dataset_id}/distinct/{column_name}")
async def get_distinct_values(
    dataset_id: int,
    column_name: str,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_datasets.get_distinct_values(dataset_id, column_name)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{dataset_id}/refresh")
async def refresh_columns(
    dataset_id: int,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_datasets.refresh_columns(dataset_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("", status_code=201)
async def create_dataset(
    request: CreateDatasetRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_datasets.create_dataset(
            database_id=request.database_id,
            table_name=request.table_name,
            schema=request.table_schema,
            description=request.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class PublishDatasetRequest(BaseModel):
    database_id: int
    sql: str
    db_schema: str | None = None
    name: str
    description: str | None = None


@router.post("/publish", status_code=201)
async def publish_dataset(
    request: PublishDatasetRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    """Materializa uma query SELECT/WITH em tabela física e registra como Dataset."""
    try:
        validar_sql(request.sql)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not request.name.strip():
        raise HTTPException(status_code=422, detail="Nome do dataset é obrigatório.")

    table_name = generate_table_name(request.name)

    try:
        await materialize_query(
            database_id=request.database_id,
            sql=request.sql,
            schema=request.db_schema,
            table_name=table_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        dataset = await superset_datasets.create_dataset(
            database_id=request.database_id,
            table_name=table_name,
            schema=request.db_schema,
            description=request.description,
            display_name=request.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": dataset.get("id"),
        "table_name": table_name,
        "schema": request.db_schema,
        "name": request.name,
        "description": request.description,
        "database_id": request.database_id,
    }
