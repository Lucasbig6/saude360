from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_token
from app.auth.roles import require_role
from app.db.session import get_db
from app.models import Project, ProjectSource
from app.superset import sources as superset_sources
from app.superset.sources import SupersetAPIError

router = APIRouter(prefix="/sources", tags=["Sources"])


class CreateSourceRequest(BaseModel):
    database_name: str
    engine: str = "postgresql"
    host: str
    port: int = 5432
    database: str
    username: str
    password: str
    # Escopo de projeto (opcional): a fonte nasce ligada ao projeto que a criou.
    project_id: uuid.UUID | None = Field(default=None, alias="projectId")


class LinkSourceProjectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: uuid.UUID = Field(alias="projectId")


class UpdateSourceRequest(BaseModel):
    database_name: str | None = None
    host: str | None = None
    port: int | None = None
    database: str | None = None
    username: str | None = None
    password: str | None = None


class TestConnectionRequest(BaseModel):
    host: str
    port: int = 5432
    database: str
    username: str
    password: str


def _project_exists(db: Session, project_id: uuid.UUID) -> bool:
    return db.get(Project, project_id) is not None


def _source_ids_for_project(db: Session, project_id: uuid.UUID) -> set[int]:
    rows = db.scalars(
        select(ProjectSource.source_id).where(ProjectSource.project_id == project_id)
    ).all()
    return set(rows)


def _link_source(
    db: Session, project_id: uuid.UUID, source_id: int, *, flush: bool = False
) -> None:
    existing = db.scalar(
        select(ProjectSource).where(
            ProjectSource.project_id == project_id,
            ProjectSource.source_id == source_id,
        )
    )
    if existing is None:
        db.add(ProjectSource(project_id=project_id, source_id=source_id))
    if flush:
        db.flush()


@router.get("")
async def list_sources(
    project_id: uuid.UUID | None = Query(default=None, alias="projectId"),
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    """Lista databases do Superset.

    Com ``projectId``, devolve apenas as fontes ligadas ao projeto (índice
    local ``project_sources``). Sem filtro, devolve todas — comportamento
    original preservado.
    """
    payload = await superset_sources.list_databases()
    if project_id is None:
        return payload

    source_ids = _source_ids_for_project(db, project_id)
    result = [
        item for item in payload.get("result", []) if item.get("id") in source_ids
    ]
    payload = {**payload, "result": result, "count": len(result)}
    return payload


@router.post("", status_code=201)
async def create_source(
    request: CreateSourceRequest,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    _require_analyst: None = Depends(require_role({"ANALISTA", "ADMIN"})),
) -> dict[str, Any]:
    project_id = request.project_id
    if project_id is not None and not _project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    data = request.model_dump(exclude={"project_id"})
    try:
        created = await superset_sources.create_database(data)
    except SupersetAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    source_id = created.get("id") if isinstance(created, dict) else None
    if project_id is not None and isinstance(source_id, int):
        _link_source(db, project_id, source_id)
        db.commit()
    return created


@router.get("/{source_id}/projects")
def list_source_projects(
    source_id: int,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> list[dict[str, Any]]:
    """Projetos aos quais a fonte está ligada."""
    rows = db.scalars(
        select(ProjectSource).where(ProjectSource.source_id == source_id)
    ).all()
    if not rows:
        return []
    projects = db.scalars(
        select(Project).where(Project.id.in_([row.project_id for row in rows]))
    ).all()
    return [
        {"id": str(project.id), "name": project.name, "description": project.description}
        for project in projects
    ]


@router.post("/{source_id}/projects", status_code=201)
def link_source_project(
    source_id: int,
    request: LinkSourceProjectRequest,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    """Associa uma fonte existente a um projeto."""
    if not _project_exists(db, request.project_id):
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    _link_source(db, request.project_id, source_id)
    db.commit()
    return {"projectId": str(request.project_id), "sourceId": source_id}


@router.delete("/{source_id}/projects/{project_id}", status_code=204)
def unlink_source_project(
    source_id: int,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> None:
    row = db.scalar(
        select(ProjectSource).where(
            ProjectSource.project_id == project_id,
            ProjectSource.source_id == source_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Ligação não encontrada")
    db.delete(row)
    db.commit()


@router.post("/test")
async def test_source_connection(
    request: TestConnectionRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    return await superset_sources.test_connection(request.model_dump())


@router.get("/{source_id}")
async def get_source(
    source_id: int,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_sources.get_database(source_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{source_id}")
async def update_source(
    source_id: int,
    request: UpdateSourceRequest,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        data = request.model_dump(exclude_unset=True)
        return await superset_sources.update_database(source_id, data)
    except SupersetAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: int,
    token: str = Depends(get_current_token),
) -> None:
    try:
        await superset_sources.delete_database(source_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{source_id}/datasets")
async def get_source_datasets(
    source_id: int,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_sources.get_database_datasets(source_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{source_id}/schemas")
async def get_source_schemas(
    source_id: int,
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_sources.get_database_schemas(source_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{source_id}/tables")
async def get_source_tables(
    source_id: int,
    schema: str = Query(..., min_length=1),
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_sources.get_database_tables(source_id, schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{source_id}/table-metadata")
async def get_source_table_metadata(
    source_id: int,
    schema: str = Query(..., min_length=1),
    table: str = Query(..., min_length=1),
    token: str = Depends(get_current_token),
) -> dict[str, Any]:
    try:
        return await superset_sources.get_table_metadata(source_id, schema, table)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
