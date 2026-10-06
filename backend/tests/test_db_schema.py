from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models import (
    Analysis,
    AuditLog,
    Dashboard,
    DashboardFilter,
    DashboardWidget,
    Project,
    Role,
    Source,
    User,
    UserRole,
)

EXPECTED_TABLES = {
    "ai_messages",
    "ai_sessions",
    "ai_tool_calls",
    "analyses",
    "audit_logs",
    "dashboard_filters",
    "dashboard_widgets",
    "dashboards",
    "project_sources",
    "projects",
    "roles",
    "sources",
    "user_roles",
    "users",
}

EXPECTED_ON_DELETE = {
    "fk_dashboard_widgets_dashboard_id_dashboards": "c",
    "fk_dashboard_widgets_analysis_id_analyses": "c",
    "fk_dashboard_filters_dashboard_id_dashboards": "c",
    "fk_user_roles_user_id_users": "c",
    "fk_user_roles_role_id_roles": "c",
    "fk_analyses_created_by_users": "n",
    "fk_analyses_project_id_projects": "n",
    "fk_project_sources_project_id_projects": "c",
    "fk_dashboards_created_by_users": "n",
    "fk_dashboards_project_id_projects": "n",
    "fk_projects_created_by_users": "n",
    "fk_sources_created_by_users": "n",
    "fk_audit_logs_user_id_users": "n",
}


@pytest.fixture
def db(migrated_db):
    """Sessão ligada ao banco de testes, com rollback ao final de cada teste."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def sfx() -> str:
    return uuid.uuid4().hex[:8]


def count_rows(db, model, row_id) -> int:
    """Conta linhas com consulta nova (ignora o identity map da sessão)."""
    return (
        db.scalar(select(func.count()).select_from(model).where(model.id == row_id)) or 0
    )


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


def test_runs_against_test_database(db, migrated_db):
    assert "saude360_test" in migrated_db
    assert db.get_bind().url.database == "saude360_test"


def test_alembic_migration_applied(db):
    version = db.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == "0006_project_sources"


def test_analysis_has_chart_config_column(db):
    inspector = inspect(db.get_bind())
    columns = {c["name"]: str(c["type"]) for c in inspector.get_columns("analyses")}
    assert "chart_config" in columns
    assert columns["chart_config"].lower() == "jsonb"


def test_dashboard_widgets_has_widget_column(db):
    inspector = inspect(db.get_bind())
    columns = {c["name"]: str(c["type"]) for c in inspector.get_columns("dashboard_widgets")}
    assert "widget" in columns
    assert columns["widget"].lower() == "jsonb"


def _load_backfill_sql() -> str:
    """SQL do backfill da migração 0004 (mesmo arquivo da migração)."""
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0004_dashboard_widgets_v2.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0004", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module._BACKFILL


@pytest.mark.parametrize(
    ("chart_type", "dimension", "metric", "expected"),
    [
        (
            "line",
            "mes",
            "total",
            {
                "type": "line",
                "legend": True,
                "tooltip": True,
                "encoding": {"x": "mes", "y": "total"},
            },
        ),
        ("table", None, None, {"type": "table"}),
        (
            "boxplot",
            None,
            "total",
            {
                "type": "bar",
                "legend": True,
                "tooltip": True,
                "encoding": {"y": "total"},
            },
        ),
        (None, None, None, {"type": "bar", "legend": True, "tooltip": True}),
    ],
)
def test_backfill_derives_widget_from_legacy_analysis(
    db, chart_type, dimension, metric, expected
):
    analysis = Analysis(
        name=f"analise-{sfx()}",
        sql="SELECT 1",
        chart_type=chart_type,
        dimension=dimension,
        metric=metric,
    )
    dashboard = Dashboard(name="Painel", slug=f"painel-{sfx()}")
    db.add_all([analysis, dashboard])
    db.flush()
    db.add(
        DashboardWidget(
            dashboard_id=dashboard.id, analysis_id=analysis.id, widget={}
        )
    )
    db.commit()

    # linha pré-migração: config vazia
    db.execute(
        text("UPDATE dashboard_widgets SET widget = '{}'::jsonb WHERE dashboard_id = :id"),
        {"id": dashboard.id},
    )
    db.execute(text(_load_backfill_sql()))

    stored = db.scalar(
        select(DashboardWidget.widget).where(
            DashboardWidget.dashboard_id == dashboard.id
        )
    )
    assert stored == expected


def test_expected_tables_exist(db):
    inspector = inspect(db.get_bind())
    tables = set(inspector.get_table_names()) - {"alembic_version"}
    assert tables == EXPECTED_TABLES


# ---------------------------------------------------------------------------
# UUIDs
# ---------------------------------------------------------------------------


def test_primary_keys_are_uuid(db):
    inspector = inspect(db.get_bind())
    for table in EXPECTED_TABLES:
        pk_columns = inspector.get_pk_constraint(table)["constrained_columns"]
        assert pk_columns, f"{table} sem primary key"
        columns = {c["name"]: c["type"] for c in inspector.get_columns(table)}
        for column in pk_columns:
            assert str(columns[column]).lower() == "uuid", (
                f"{table}.{column} é {columns[column]}, esperado uuid"
            )


def test_insert_generates_uuid_ids(db):
    suffix = sfx()
    user = User(username=f"user-{suffix}", full_name="Usuário Teste")
    other = User(username=f"user2-{suffix}", full_name="Usuário Teste 2")
    db.add_all([user, other])
    db.flush()

    assert isinstance(user.id, uuid.UUID)
    assert isinstance(other.id, uuid.UUID)
    assert user.id != other.id
    assert not isinstance(user.id, int)


def test_uuid_accepts_external_id(db):
    explicit = uuid.uuid4()
    analysis = Analysis(id=explicit, name=f"analise-{sfx()}", sql="SELECT 1")
    db.add(analysis)
    db.flush()

    assert db.get(Analysis, explicit) is analysis
    db.delete(analysis)
    db.commit()


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------


def test_users_username_unique(db):
    username = f"dup-{sfx()}"
    db.add(User(username=username, full_name="A"))
    db.commit()

    db.add(User(username=username, full_name="B"))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_users_email_unique(db):
    email = f"dup-{sfx()}@example.org"
    db.add(User(username=f"mail-a-{sfx()}", full_name="A", email=email))
    db.commit()

    db.add(User(username=f"mail-b-{sfx()}", full_name="B", email=email))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_roles_name_unique(db):
    name = f"ROLE-{sfx()}"
    db.add(Role(name=name, description="A"))
    db.commit()

    db.add(Role(name=name, description="B"))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_dashboards_slug_unique(db):
    slug = f"painel-{sfx()}"
    db.add(Dashboard(name="Painel A", slug=slug))
    db.commit()

    db.add(Dashboard(name="Painel B", slug=slug))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_foreign_keys_have_expected_on_delete(db):
    rows = db.execute(
        text(
            "SELECT conname, confdeltype FROM pg_constraint "
            "WHERE contype = 'f' AND conname LIKE 'fk_%'"
        )
    ).all()
    found = dict(rows)

    for constraint, on_delete in EXPECTED_ON_DELETE.items():
        assert constraint in found, f"FK {constraint} não encontrada"
        assert found[constraint] == on_delete, (
            f"{constraint}: confdeltype={found[constraint]}, esperado {on_delete}"
        )


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------


def test_sources_accept_valid_types(db):
    for source_type in ("postgresql", "csv", "excel", "parquet", "api"):
        db.add(Source(name=f"{source_type}-{sfx()}", type=source_type))
    db.commit()


def test_sources_reject_invalid_type(db):
    db.add(Source(name=f"invalido-{sfx()}", type="mysql"))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


# ---------------------------------------------------------------------------
# Cascades
# ---------------------------------------------------------------------------


def test_dashboard_delete_cascades_widgets_and_filters(db):
    analysis = Analysis(name=f"analise-{sfx()}", sql="SELECT 1")
    dashboard = Dashboard(name="Painel", slug=f"painel-{sfx()}")
    db.add_all([analysis, dashboard])
    db.flush()
    db.add(DashboardWidget(dashboard_id=dashboard.id, analysis_id=analysis.id))
    db.add(
        DashboardFilter(
            dashboard_id=dashboard.id, column_name="cidade", operator="eq"
        )
    )
    db.commit()

    db.execute(text("DELETE FROM dashboards WHERE id = :id"), {"id": dashboard.id})
    db.commit()

    widgets = db.scalar(
        select(func.count())
        .select_from(DashboardWidget)
        .where(DashboardWidget.dashboard_id == dashboard.id)
    )
    filters = db.scalar(
        select(func.count())
        .select_from(DashboardFilter)
        .where(DashboardFilter.dashboard_id == dashboard.id)
    )
    dashboards = db.scalar(
        select(func.count()).select_from(Dashboard).where(Dashboard.id == dashboard.id)
    )
    assert widgets == 0
    assert filters == 0
    assert dashboards == 0
    assert count_rows(db, Analysis, analysis.id) == 1


def test_analysis_delete_cascades_widget(db):
    analysis = Analysis(name=f"analise-{sfx()}", sql="SELECT 1")
    dashboard = Dashboard(name="Painel", slug=f"painel-{sfx()}")
    db.add_all([analysis, dashboard])
    db.flush()
    db.add(DashboardWidget(dashboard_id=dashboard.id, analysis_id=analysis.id))
    db.add(
        DashboardFilter(
            dashboard_id=dashboard.id, column_name="cidade", operator="eq"
        )
    )
    db.commit()

    db.execute(text("DELETE FROM analyses WHERE id = :id"), {"id": analysis.id})
    db.commit()

    widgets = db.scalar(
        select(func.count())
        .select_from(DashboardWidget)
        .where(DashboardWidget.analysis_id == analysis.id)
    )
    assert widgets == 0
    assert count_rows(db, Dashboard, dashboard.id) == 1
    assert (
        db.scalar(
            select(func.count())
            .select_from(DashboardFilter)
            .where(DashboardFilter.dashboard_id == dashboard.id)
        )
        == 1
    )


def test_user_delete_cascades_user_roles(db):
    suffix = sfx()
    user = User(username=f"user-{suffix}", full_name="Usuário")
    role = Role(name=f"ROLE-{suffix}", description="Role")
    db.add_all([user, role])
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
    db.commit()

    links = db.scalar(
        select(func.count())
        .select_from(UserRole)
        .where(UserRole.user_id == user.id)
    )
    assert links == 0
    assert count_rows(db, Role, role.id) == 1


def test_created_by_set_null_when_user_deleted(db):
    suffix = sfx()
    user = User(username=f"user-{suffix}", full_name="Usuário")
    db.add(user)
    db.flush()

    analysis = Analysis(name=f"analise-{suffix}", sql="SELECT 1", created_by=user.id)
    dashboard = Dashboard(
        name="Painel", slug=f"painel-{suffix}", created_by=user.id
    )
    source = Source(name=f"fonte-{suffix}", type="csv", created_by=user.id)
    db.add_all([analysis, dashboard, source])
    db.commit()

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
    db.commit()

    analysis_created_by = db.scalar(
        select(Analysis.created_by).where(Analysis.id == analysis.id)
    )
    dashboard_created_by = db.scalar(
        select(Dashboard.created_by).where(Dashboard.id == dashboard.id)
    )
    source_created_by = db.scalar(
        select(Source.created_by).where(Source.id == source.id)
    )

    assert count_rows(db, Analysis, analysis.id) == 1
    assert count_rows(db, Dashboard, dashboard.id) == 1
    assert count_rows(db, Source, source.id) == 1
    assert analysis_created_by is None
    assert dashboard_created_by is None
    assert source_created_by is None


def test_audit_log_user_set_null_when_user_deleted(db):
    user = User(username=f"user-{sfx()}", full_name="Usuário")
    db.add(user)
    db.flush()

    log = AuditLog(
        user_id=user.id,
        action="create",
        resource_type="analysis",
        resource_id=uuid.uuid4(),
    )
    db.add(log)
    db.commit()

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
    db.commit()

    row = db.execute(
        select(AuditLog.user_id, AuditLog.data).where(AuditLog.id == log.id)
    ).one_or_none()

    assert row is not None
    assert row.user_id is None
    assert row.data == {}


def test_project_delete_sets_null_on_resources(db):
    project = Project(name=f"projeto-{sfx()}", description="Tema")
    analysis = Analysis(name=f"analise-{sfx()}", sql="SELECT 1")
    dashboard = Dashboard(name="Painel", slug=f"painel-{sfx()}")
    db.add_all([project, analysis, dashboard])
    db.flush()
    analysis.project_id = project.id
    dashboard.project_id = project.id
    db.commit()

    db.execute(text("DELETE FROM projects WHERE id = :id"), {"id": project.id})
    db.commit()

    analysis_project = db.scalar(
        select(Analysis.project_id).where(Analysis.id == analysis.id)
    )
    dashboard_project = db.scalar(
        select(Dashboard.project_id).where(Dashboard.id == dashboard.id)
    )

    assert count_rows(db, Project, project.id) == 0
    assert count_rows(db, Analysis, analysis.id) == 1
    assert count_rows(db, Dashboard, dashboard.id) == 1
    assert analysis_project is None
    assert dashboard_project is None
