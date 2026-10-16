from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_created_by, get_current_token
from app.auth.roles import require_role
from app.db.session import get_db
from app.models import (
    Analysis,
    Dashboard,
    DashboardFilter,
    DashboardPage,
    DashboardWidget,
    Project,
)
from app.schemas.dashboards import (
    CHART_TYPES,
    DashboardCreate,
    DashboardResponse,
    DashboardUpdate,
    FilterIn,
    PageIn,
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


def _widget_dto(row: DashboardWidget, include_analysis: bool = False) -> dict[str, object]:
    dto: dict[str, object] = {
        "id": row.id,
        "analysisId": row.analysis_id,
        "layout": {
            "x": row.position_x,
            "y": row.position_y,
            "w": row.width,
            "h": row.height,
        },
        "widget": row.widget or {},
        "pageId": row.page_id,
    }
    if include_analysis and row.analysis_id is not None and row.analysis is not None:
        a = row.analysis
        dto["analysisData"] = {
            "id": str(a.id),
            "name": a.name,
            "sql": a.sql,
            "databaseId": a.database_id,
            "dbSchema": a.db_schema,
            "chartType": a.chart_type,
            "dimension": a.dimension,
            "metric": a.metric,
        }
    return dto


def _filter_dto(row: DashboardFilter) -> dict[str, object]:
    return {
        "id": row.id,
        "datasetId": row.dataset_id,
        "column": row.column_name,
        "operator": row.operator,
        "controlType": row.control_type,
        "defaultValue": decode_filter_value(row.default_value),
        "scope": decode_filter_value(row.scope),
    }


def _page_dto(row: DashboardPage) -> dict[str, object]:
    return {"id": row.id, "name": row.name, "position": row.position}


def _to_response(dashboard: Dashboard, include_analysis: bool = False) -> DashboardResponse:
    """ORM -> payload camelCase (`layout`, `column`, `defaultValue`...)."""
    return DashboardResponse.model_validate(
        {
            "id": dashboard.id,
            "name": dashboard.name,
            "description": dashboard.description,
            "slug": dashboard.slug,
            "appearance": dashboard.appearance,
            "widgets": [_widget_dto(row, include_analysis) for row in dashboard.widgets],
            "filters": [_filter_dto(row) for row in dashboard.filters],
            "projectId": dashboard.project_id,
            "createdBy": dashboard.created_by,
            "createdAt": dashboard.created_at,
            "updatedAt": dashboard.updated_at,
            "pages": [_page_dto(row) for row in dashboard.pages],
            "activePageId": dashboard.active_page_id,
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


def _load_analyses(
    db: Session, analysis_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Analysis]:
    """Valida a existência das análises e devolve as linhas para derivação."""
    if not analysis_ids:
        return {}
    rows = db.scalars(
        select(Analysis).where(Analysis.id.in_(analysis_ids))
    ).all()
    found = {row.id: row for row in rows}
    missing = [str(w) for w in analysis_ids if w not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Análises inexistentes: {', '.join(missing)}",
        )
    return found


def _default_widget(analysis: Analysis) -> dict[str, object]:
    """Config v2 derivada da análise legada (espelha o frontend)."""
    if analysis.chart_type == "table":
        return {"type": "table"}
    if analysis.chart_type == "kpi":
        return {
            "type": "kpi",
            "field": analysis.metric,
            "function": "sum" if analysis.metric else "count",
        }
    chart_type = analysis.chart_type if analysis.chart_type in CHART_TYPES else "bar"
    config: dict[str, object] = {"type": chart_type, "legend": True, "tooltip": True}
    encoding = {
        key: value
        for key, value in (("x", analysis.dimension), ("y", analysis.metric))
        if value
    }
    if encoding:
        config["encoding"] = encoding
    return config


def _widget_payload(
    widget: WidgetIn, analysis: Analysis | None
) -> dict[str, object]:
    """Payload do cliente (validado) ou derivação da análise para o legado."""
    if widget.widget is None:
        if analysis is None:
            raise HTTPException(
                status_code=400,
                detail="Widget independente precisa de configuração.",
            )
        return _default_widget(analysis)
    return widget.widget.model_dump(mode="json", exclude_none=True)


def _next_timestamps(count: int) -> list[datetime]:
    """Timestamps distintos: `order_by(created_at)` preserva a ordem do payload."""
    base = datetime.now(UTC)
    return [base + timedelta(microseconds=index) for index in range(count)]


def _build_widget(
    dashboard_id: uuid.UUID,
    widget: WidgetIn,
    analysis: Analysis,
    created_at: datetime,
    default_page_id: uuid.UUID | None,
) -> DashboardWidget:
    return DashboardWidget(
        id=widget.id or uuid.uuid4(),
        dashboard_id=dashboard_id,
        analysis_id=widget.analysis_id,
        position_x=widget.layout.x,
        position_y=widget.layout.y,
        width=widget.layout.w,
        height=widget.layout.h,
        widget=_widget_payload(widget, analysis),
        page_id=widget.page_id if widget.page_id is not None else default_page_id,
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
        control_type=filter_in.control_type,
        default_value=filter_in.default_value,
        scope=filter_in.scope,
        created_at=created_at,
    )


def _sync_pages(
    db: Session,
    dashboard: Dashboard,
    pages: list[PageIn],
) -> list[DashboardPage]:
    """Diff de páginas no mesmo formato dos widgets/filtros.

    A ordem da lista do payload é a posição canônica (``position`` = índice);
    ids honrados do cliente permitem criar páginas novas já com o UUID da UI.
    Páginas ausentes do payload são excluídas — o FK ``page_id`` faz cascade
    e remove os widgets da página junto. Devolve as linhas finais em ordem.
    """
    existing = {row.id: row for row in dashboard.pages}
    seen: set[uuid.UUID] = set()
    ordered: list[DashboardPage] = []
    for position, page in enumerate(pages):
        if page.id is not None and page.id in existing:
            row = existing[page.id]
            row.name = page.name
            row.position = position
        else:
            row = DashboardPage(
                id=page.id or uuid.uuid4(),
                dashboard_id=dashboard.id,
                name=page.name,
                position=position,
            )
            db.add(row)
        seen.add(row.id)
        ordered.append(row)

    for page_id, row in existing.items():
        if page_id not in seen:
            db.delete(row)

    dashboard.pages = ordered
    return ordered


def _resolve_active_page(
    dashboard: Dashboard,
    requested: uuid.UUID | None,
    final_pages: list[DashboardPage],
) -> None:
    """Página ativa: valida o pedido e coerza para a primeira quando órfã."""
    ids = [row.id for row in final_pages]
    if not ids:
        dashboard.active_page_id = None
    elif requested is not None and requested in ids:
        dashboard.active_page_id = requested
    elif requested is None and dashboard.active_page_id in ids:
        # PUT sem activePageId: mantém a página ativa atual (se válida).
        return
    else:
        # Pedido inválido ou atual órfã (página excluída) → primeira página.
        dashboard.active_page_id = ids[0]


def _validate_widget_pages(
    widgets: list[WidgetIn],
    final_pages: list[DashboardPage],
) -> None:
    """Todo ``pageId`` informado precisa existir; ``None`` segue permitido
    (widget de dashboard legado sem páginas explícitas)."""
    valid = {row.id for row in final_pages}
    missing = sorted(
        str(w.page_id)
        for w in widgets
        if w.page_id is not None and w.page_id not in valid
    )
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Páginas inexistentes para widgets: {', '.join(missing)}",
        )


def _default_page_id(dashboard: Dashboard) -> uuid.UUID | None:
    if dashboard.active_page_id is not None:
        return dashboard.active_page_id
    pages = sorted(dashboard.pages, key=lambda row: row.position)
    return pages[0].id if pages else None


def _sync_widgets(
    db: Session,
    dashboard: Dashboard,
    widgets: list[WidgetIn],
) -> None:
    analyses = _load_analyses(
        db, [w.analysis_id for w in widgets if w.analysis_id is not None]
    )
    default_page_id = _default_page_id(dashboard)

    existing = {widget.id: widget for widget in dashboard.widgets}
    seen: set[uuid.UUID] = set()
    ordered: list[DashboardWidget] = []
    for widget, created_at in zip(widgets, _next_timestamps(len(widgets))):
        analysis = analyses.get(widget.analysis_id) if widget.analysis_id else None
        config = _widget_payload(widget, analysis)
        if widget.id is not None and widget.id in existing:
            row = existing[widget.id]
            row.analysis_id = widget.analysis_id
            row.position_x = widget.layout.x
            row.position_y = widget.layout.y
            row.width = widget.layout.w
            row.height = widget.layout.h
            row.widget = config
            # pageId ausente mantém a página atual do widget.
            if widget.page_id is not None:
                row.page_id = widget.page_id
        else:
            row = _build_widget(
                dashboard.id, widget, analysis, created_at, default_page_id
            )
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
            row.control_type = filter_in.control_type
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
    """Leitura pública (sem auth): o link compartilhado precisa abrir.

    Os dados de cada análise são embutidos em ``analysisData`` para que o
    viewer público não precise chamar /api/analyses/:id (rota autenticada).
    """
    dashboard = db.scalar(
        select(Dashboard).where(Dashboard.slug == slug.strip().lower())
    )
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard não encontrado")
    return _to_response(dashboard, include_analysis=True)


@router.post("", status_code=201, response_model=DashboardResponse)
def create_dashboard(
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
    _require_analyst: None = Depends(require_role({"ANALISTA", "ADMIN"})),
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
    final_pages = _sync_pages(db, dashboard, payload.pages or [])
    # Persiste as páginas antes de gravar active_page_id: o UPDATE em
    # dashboards não pode precedir o INSERT em dashboard_pages (FK).
    db.flush()
    _resolve_active_page(dashboard, payload.active_page_id, final_pages)
    _validate_widget_pages(payload.widgets, final_pages)
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
    pages_payload = data.pop("pages", None)

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

    # Páginas antes dos widgets: o sync valida referências e define o
    # padrão de página dos widgets novos.
    if pages_payload is not None:
        final_pages = _sync_pages(db, dashboard, payload.pages or [])
        # Mesma ordem do create: páginas materializadas antes de tocar em
        # active_page_id (UPDATE em dashboards vs INSERT/DELETE em pages).
        db.flush()
    else:
        final_pages = list(dashboard.pages)
    _resolve_active_page(dashboard, data.get("active_page_id"), final_pages)

    if widgets is not None:
        _validate_widget_pages(payload.widgets or [], final_pages)
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
    _require_admin: None = Depends(require_role({"ADMIN"})),
) -> None:
    dashboard = _get_or_404(db, dashboard_id)
    db.delete(dashboard)
    db.commit()
