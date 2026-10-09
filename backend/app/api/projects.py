from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_created_by, get_current_token
from app.auth.roles import require_role
from app.db.session import get_db
from app.models import Analysis, Dashboard, Project, ProjectSource
from app.schemas.projects import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["Projects"])


def _get_project(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return project


@dataclass
class _Counts:
    analysis_count: int = 0
    chart_count: int = 0
    dashboard_count: int = 0
    source_count: int = 0
    last_activity: datetime | None = None

    def add_activity(self, value: datetime | None) -> None:
        if value is None:
            return
        if self.last_activity is None or value > self.last_activity:
            self.last_activity = value


def _counts_by_project(
    db: Session, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, _Counts]:
    """Contagens e última atividade em 4 queries agrupadas (sem N+1).

    - análises = ``chart_type = 'table'``
    - gráficos = ``chart_type IS DISTINCT FROM 'table'`` (inclui NULL, como o
      frontend, que trata tudo que não é ``table`` como gráfico)
    - ``last_activity`` ignora ``max(...)`` nulo (projeto sem recursos).
    """
    counts: dict[uuid.UUID, _Counts] = {pid: _Counts() for pid in project_ids}
    if not counts:
        return counts

    analysis_rows = db.execute(
        select(
            Analysis.project_id,
            func.sum(case((Analysis.chart_type == "table", 1), else_=0)),
            func.sum(
                case((Analysis.chart_type.is_distinct_from("table"), 1), else_=0)
            ),
            func.max(Analysis.updated_at),
        )
        .where(Analysis.project_id.in_(list(counts)))
        .group_by(Analysis.project_id)
    ).all()
    for project_id, table_count, chart_count, last_updated in analysis_rows:
        entry = counts[project_id]
        entry.analysis_count = int(table_count or 0)
        entry.chart_count = int(chart_count or 0)
        entry.add_activity(last_updated)

    dashboard_rows = db.execute(
        select(
            Dashboard.project_id,
            func.count(),
            func.max(Dashboard.updated_at),
        )
        .where(Dashboard.project_id.in_(list(counts)))
        .group_by(Dashboard.project_id)
    ).all()
    for project_id, dashboard_count, last_updated in dashboard_rows:
        entry = counts[project_id]
        entry.dashboard_count = int(dashboard_count or 0)
        entry.add_activity(last_updated)

    source_rows = db.execute(
        select(ProjectSource.project_id, func.count())
        .where(ProjectSource.project_id.in_(list(counts)))
        .group_by(ProjectSource.project_id)
    ).all()
    for project_id, source_count in source_rows:
        counts[project_id].source_count = int(source_count or 0)

    return counts


def _to_response(project: Project, counts: _Counts) -> ProjectResponse:
    # updatedAt = maior entre project.updated_at e a última atividade de
    # análises/painéis; valores nulos de recursos são ignorados.
    updated_at = project.updated_at
    if counts.last_activity is not None and counts.last_activity > updated_at:
        updated_at = counts.last_activity
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        analysis_count=counts.analysis_count,
        chart_count=counts.chart_count,
        dashboard_count=counts.dashboard_count,
        source_count=counts.source_count,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=updated_at,
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> list[ProjectResponse]:
    projects = list(db.scalars(select(Project)).all())
    counts = _counts_by_project(db, [project.id for project in projects])
    responses = [_to_response(project, counts[project.id]) for project in projects]
    responses.sort(key=lambda item: item.updated_at, reverse=True)
    return responses


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> ProjectResponse:
    project = _get_project(db, project_id)
    counts = _counts_by_project(db, [project.id])
    return _to_response(project, counts[project.id])


@router.post("", status_code=201, response_model=ProjectResponse)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
    _require_analyst: None = Depends(require_role({"ANALISTA", "ADMIN"})),
) -> ProjectResponse:
    project = Project(**payload.model_dump(), created_by=created_by)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_response(project, _Counts())


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> ProjectResponse:
    project = _get_project(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    counts = _counts_by_project(db, [project.id])
    return _to_response(project, counts[project.id])


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    _require_admin: None = Depends(require_role({"ADMIN"})),
) -> None:
    # FKs em analyses/dashboards usam ON DELETE SET NULL: os recursos
    # permanecem e voltam para as listas globais.
    project = _get_project(db, project_id)
    db.delete(project)
    db.commit()
