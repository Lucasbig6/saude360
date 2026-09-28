from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_created_by, get_current_token
from app.db.session import get_db
from app.models import Analysis, Dashboard, DashboardFilter, DashboardWidget, Project
from app.schemas.dashboards import (
    DashboardCreate,
    DashboardResponse,
    DashboardUpdate,
    FilterIn,
    WidgetIn,
    decode_filter_value,
)
from app.superset.naming import slugify_table_name

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])

MAX_SLUG_ATTEMPTS = 100


def _slugify(name: str) -> str:
    return slugify_table_name(name).replace("_", "-") or "dashboard"


def _unique_slug(db: Session, base: str, exclude_id: uuid.UUID | None = None) -> str:
    """Base + `-2`, `-3`... até achar um slug livre."""
    candidate = base
    for attempt in range(1, MAX_SLUG_ATTEMPTS):
        stmt = select(Dashboard.id).where(Dashboard.slug == candidate)
        owner_id = db.scalar(stmt)
        if owner_id is None or owner_id == exclude_id:
            return candidate
        candidate = f"{base}-{attempt + 1}"
    raise HTTPException(status_code=409, detail="Não foi possível gerar slug único")


def _get_or_404(db: Session, dashboard_id: uuid.UUID) -> Dashboard:
    # select() (e não db.get) para que widgets/filters sejam carregados de uma vez
    # (lazy="selectin") enquanto a sessão ainda está aberta.
    dashboard = db.scalar(select(Dashboard).where(Dashboard.id == dashboard_id))
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard não encontrado")
    return dashboard


def _validate_project(db: Session, project_id: uuid.UUID | None) -> None:
    """Associação é erro de requisição (400), não 404."""
    if project_id is None:
        return
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=400, detail="Projeto não encontrado")


def _reload(db: Session, dashboard: Dashboard) -> Dashboard:
    return db.scalar(select(Dashboard).where(Dashboard.id == dashboard.id))


def _widget_dto(row: DashboardWidget) -> dict[str, object]:
    return {
        "id": row.id,
        "analysisId": row.analysis_id,
        "layout": {
            "x": row.position_x,
            "y": row.position_y,
            "w": row.width,
            "h": row.height,
        },
    }


def _filter_dto(row: DashboardFilter) -> dict[str, object]:
    return {
        "id": row.id,
        "datasetId": row.dataset_id,
        "column": row.column_name,
        "operator": row.operator,
        "defaultValue": decode_filter_value(row.default_value),
        "scope": decode_filter_value(row.scope),
    }


def _to_response(dashboard: Dashboard) -> DashboardResponse:
    """ORM -> payload camelCase (`layout`, `column`, `defaultValue`...)."""
    return DashboardResponse.model_validate(
        {
            "id": dashboard.id,
            "name": dashboard.name,
            "description": dashboard.description,
            "slug": dashboard.slug,
            "appearance": dashboard.appearance,
            "widgets": [_widget_dto(row) for row in dashboard.widgets],
            "filters": [_filter_dto(row) for row in dashboard.filters],
            "projectId": dashboard.project_id,
            "createdBy": dashboard.created_by,
            "createdAt": dashboard.created_at,
            "updatedAt": dashboard.updated_at,
        }
    )


def _resolve_slug(db: Session, payload_slug: str | None, name: str,
                  exclude_id: uuid.UUID | None = None) -> str:
    """Slug explícito é normalizado e usado (409 se duplicado); senão é gerado."""
    if payload_slug and payload_slug.strip():
        slug = _slugify(payload_slug)
        owner_id = db.scalar(select(Dashboard.id).where(Dashboard.slug == slug))
        if owner_id is not None and owner_id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Slug já em uso: {slug}")
        return slug
    return _unique_slug(db, _slugify(name), exclude_id)


def _validate_analyses(db: Session, widget_ids: list[uuid.UUID]) -> None:
    if not widget_ids:
        return
    found = set(
        db.scalars(select(Analysis.id).where(Analysis.id.in_(widget_ids))).all()
    )
    missing = [str(w) for w in widget_ids if w not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Análises inexistentes: {', '.join(missing)}",
        )


def _next_timestamps(count: int) -> list[datetime]:
    """Timestamps distintos: `order_by(created_at)` preserva a ordem do payload."""
    base = datetime.now(UTC)
    return [base + timedelta(microseconds=index) for index in range(count)]


def _build_widget(
    dashboard_id: uuid.UUID,
    widget: WidgetIn,
    created_at: datetime,
) -> DashboardWidget:
    return DashboardWidget(
        id=widget.id or uuid.uuid4(),
        dashboard_id=dashboard_id,
        analysis_id=widget.analysis_id,
        position_x=widget.layout.x,
        position_y=widget.layout.y,
        width=widget.layout.w,
        height=widget.layout.h,
        created_at=created_at,
    )


def _build_filter(
    dashboard_id: uuid.UUID,
    filter_in: FilterIn,
    created_at: datetime,
) -> DashboardFilter:
    return DashboardFilter(
        id=filter_in.id or uuid.uuid4(),
        dashboard_id=dashboard_id,
        dataset_id=filter_in.dataset_id,
        column_name=filter_in.column,
        operator=filter_in.operator,
        default_value=filter_in.default_value,
        scope=filter_in.scope,
        created_at=created_at,
    )


def _sync_widgets(
    db: Session,
    dashboard: Dashboard,
    widgets: list[WidgetIn],
) -> None:
    _validate_analyses(db, [w.analysis_id for w in widgets])

    existing = {widget.id: widget for widget in dashboard.widgets}
    seen: set[uuid.UUID] = set()
    ordered: list[DashboardWidget] = []
    for widget, created_at in zip(widgets, _next_timestamps(len(widgets))):
        if widget.id is not None and widget.id in existing:
            row = existing[widget.id]
            row.analysis_id = widget.analysis_id
            row.position_x = widget.layout.x
            row.position_y = widget.layout.y
            row.width = widget.layout.w
            row.height = widget.layout.h
        else:
            row = _build_widget(dashboard.id, widget, created_at)
            db.add(row)
        seen.add(row.id)
        ordered.append(row)

    for widget_id, row in existing.items():
        if widget_id not in seen:
            db.delete(row)

    dashboard.widgets = ordered


def _sync_filters(
    db: Session,
    dashboard: Dashboard,
    filters: list[FilterIn],
) -> None:
    existing = {row.id: row for row in dashboard.filters}
    seen: set[uuid.UUID] = set()
    ordered: list[DashboardFilter] = []
    for filter_in, created_at in zip(filters, _next_timestamps(len(filters))):
        if filter_in.id is not None and filter_in.id in existing:
            row = existing[filter_in.id]
            row.dataset_id = filter_in.dataset_id
            row.column_name = filter_in.column
            row.operator = filter_in.operator
            row.default_value = filter_in.default_value
            row.scope = filter_in.scope
        else:
            row = _build_filter(dashboard.id, filter_in, created_at)
            db.add(row)
        seen.add(row.id)
        ordered.append(row)

    for filter_id, row in existing.items():
        if filter_id not in seen:
            db.delete(row)

    dashboard.filters = ordered


@router.get("", response_model=list[DashboardResponse])
def list_dashboards(
    project_id: uuid.UUID | None = Query(default=None, alias="projectId"),
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> list[DashboardResponse]:
    stmt = select(Dashboard).order_by(Dashboard.created_at.desc())
    if project_id is not None:
        # Projeto inexistente não casa nenhuma linha -> coleção vazia (não 404).
        stmt = stmt.where(Dashboard.project_id == project_id)
    return [_to_response(dashboard) for dashboard in db.scalars(stmt).all()]


@router.get("/by-slug/{slug}", response_model=DashboardResponse)
def get_dashboard_by_slug(
    slug: str,
    db: Session = Depends(get_db),
) -> DashboardResponse:
    """Leitura pública (sem auth): o link compartilhado precisa abrir."""
    dashboard = db.scalar(
        select(Dashboard).where(Dashboard.slug == slug.strip().lower())
    )
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard não encontrado")
    return _to_response(dashboard)


@router.post("", status_code=201, response_model=DashboardResponse)
def create_dashboard(
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
) -> DashboardResponse:
    _validate_project(db, payload.project_id)
    slug = _resolve_slug(db, payload.slug, payload.name)
    dashboard = Dashboard(
        name=payload.name,
        description=payload.description,
        slug=slug,
        appearance=payload.appearance,
        created_by=created_by,
        project_id=payload.project_id,
    )
    db.add(dashboard)
    db.flush()
    _sync_widgets(db, dashboard, payload.widgets)
    _sync_filters(db, dashboard, payload.filters)
    db.commit()
    return _to_response(_reload(db, dashboard))


@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> DashboardResponse:
    return _to_response(_get_or_404(db, dashboard_id))


@router.put("/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(
    dashboard_id: uuid.UUID,
    payload: DashboardUpdate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> DashboardResponse:
    dashboard = _get_or_404(db, dashboard_id)
    data = payload.model_dump(exclude_unset=True)
    widgets = data.pop("widgets", None)
    filters = data.pop("filters", None)

    if "slug" in data:
        dashboard.slug = _resolve_slug(db, data.pop("slug"), dashboard.name, dashboard.id)
    if "name" in data:
        dashboard.name = data["name"]
    if "description" in data:
        dashboard.description = data["description"]
    if "appearance" in data:
        dashboard.appearance = data["appearance"]
    if "project_id" in data:
        # presente (UUID ou null) -> valida/aplica; ausente -> não altera o vínculo.
        _validate_project(db, data["project_id"])
        dashboard.project_id = data["project_id"]

    if widgets is not None:
        _sync_widgets(db, dashboard, payload.widgets or [])
    if filters is not None:
        _sync_filters(db, dashboard, payload.filters or [])

    db.commit()
    return _to_response(_reload(db, dashboard))


@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> None:
    dashboard = _get_or_404(db, dashboard_id)
    db.delete(dashboard)
    db.commit()
