from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.ai.policies import Scope, ToolPolicyError, build_policy
from app.ai.tools import build_registry
from app.ai.tools.registry import ToolContext, ToolNotAllowedError
from app.db.session import SessionLocal
from app.models import Analysis, Dashboard, DashboardWidget, User


@pytest.fixture
def db(migrated_db):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def make_context(db, policy) -> ToolContext:
    return ToolContext(
        agent_type=policy.agent_type,
        policy=policy,
        user_id=None,
        session_id=uuid.uuid4(),
        db=db,
    )


def tool(name: str):
    spec = build_registry().get(name)
    assert spec is not None, f"tool não registrada: {name}"
    return spec


def copilot_policy(**scope_kwargs) -> tuple:
    policy = build_policy("dashboard_copilot", Scope(**scope_kwargs))
    return policy


# ---------------------------------------------------------------------------
# execute_query — reusa o caminho de segurança existente
# ---------------------------------------------------------------------------


async def test_execute_query_returns_result_metadata(client, mock_superset_client, db):
    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["municipio", "total"],
        "data": [
            {"municipio": "São Paulo", "total": 10},
            {"municipio": "Campinas", "total": 5},
        ],
    }
    policy = copilot_policy(database_ids=frozenset({7}))
    spec = tool("execute_query")

    result = await spec.handler(
        make_context(db, policy), {"sql": "SELECT municipio, total FROM atendimentos"}
    )

    assert result["columns"] == ["municipio", "total"]
    assert len(result["rows"]) == 2
    assert result["rowCount"] == 2
    assert result["truncated"] is False
    assert isinstance(result["executionMs"], int)
    assert result["executionMs"] >= 0
    assert result["databaseId"] == 7
    mock_superset_client.post.assert_awaited_once()
    sent = mock_superset_client.post.await_args.kwargs["json"]
    assert sent["database_id"] == 7


async def test_execute_query_truncates_to_policy_max_rows(
    client, mock_superset_client, db
):
    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["n"],
        "data": [{"n": 1}, {"n": 2}, {"n": 3}],
    }
    policy = build_policy(
        "dashboard_copilot", Scope(database_ids=frozenset({7})), max_rows=2
    )
    spec = tool("execute_query")

    result = await spec.handler(make_context(db, policy), {"sql": "SELECT n FROM t"})

    assert len(result["rows"]) == 2
    assert result["rowCount"] == 3
    assert result["truncated"] is True


async def test_execute_query_blocks_dml_without_calling_superset(
    client, mock_superset_client, db
):
    policy = copilot_policy(database_ids=frozenset({7}))
    spec = tool("execute_query")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy), {"sql": "DELETE FROM atendimentos"}
        )

    mock_superset_client.post.assert_not_awaited()


async def test_execute_query_blocks_ddl(client, mock_superset_client, db):
    policy = copilot_policy(database_ids=frozenset({7}))
    spec = tool("execute_query")

    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {"sql": "DROP TABLE x"})


async def test_execute_query_requires_database_scope(client, mock_superset_client, db):
    policy = copilot_policy()  # sem escopo de database
    spec = tool("execute_query")

    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {"sql": "SELECT 1"})
    mock_superset_client.post.assert_not_awaited()


async def test_execute_query_rejects_llm_database_out_of_scope(
    client, mock_superset_client, db
):
    policy = copilot_policy(database_ids=frozenset({7}))
    spec = tool("execute_query")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy),
            {"sql": "SELECT 1", "database_id": 999},
        )
    mock_superset_client.post.assert_not_awaited()


async def test_execute_query_rejects_missing_sql(client, mock_superset_client, db):
    policy = copilot_policy(database_ids=frozenset({7}))
    spec = tool("execute_query")

    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {})


# ---------------------------------------------------------------------------
# get_dashboard_context — contrato do frontend
# ---------------------------------------------------------------------------


def seed_dashboard(
    db, widget_config: dict | None = None
) -> tuple[uuid.UUID, uuid.UUID]:
    analysis = Analysis(
        name="Atendimentos por município",
        sql="SELECT municipio, COUNT(*) FROM atendimentos GROUP BY 1",
        database_id=7,
        db_schema="public",
        dataset_id=12,
        chart_type="bar",
        dimension="municipio",
        metric="count",
    )
    db.add(analysis)
    db.flush()
    dashboard = Dashboard(
        name="Painel SUS",
        description="Visão geral",
        slug=f"painel-{uuid.uuid4().hex[:8]}",
    )
    db.add(dashboard)
    db.flush()
    db.add(
        DashboardWidget(
            dashboard_id=dashboard.id,
            analysis_id=analysis.id,
            position_x=1,
            position_y=2,
            width=6,
            height=4,
            widget=widget_config or {},
        )
    )
    db.commit()
    return dashboard.id, analysis.id


async def test_get_dashboard_context_matches_frontend_contract(db):
    dashboard_id, analysis_id = seed_dashboard(db)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("get_dashboard_context")

    result = await spec.handler(make_context(db, policy), {})

    assert result["dashboard"]["id"] == str(dashboard_id)
    assert result["dashboard"]["name"] == "Painel SUS"
    widget = result["widgets"][0]
    assert widget["analysisId"] == str(analysis_id)
    assert widget["title"] == "Atendimentos por município"
    assert widget["chartType"] == "bar"
    assert widget["datasetId"] == 12
    assert widget["databaseId"] == 7
    assert widget["dbSchema"] == "public"
    assert widget["dimension"] == "municipio"
    assert widget["metric"] == "count"
    assert widget["sql"].startswith("SELECT")
    assert result["filters"] == []


async def test_get_dashboard_context_ignores_llm_arguments(db):
    """O dashboard vem do escopo da sessão — argumentos do LLM são irrelevantes."""
    dashboard_id, _ = seed_dashboard(db)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("get_dashboard_context")

    result = await spec.handler(
        make_context(db, policy), {"dashboard_id": str(uuid.uuid4())}
    )
    assert result["dashboard"]["id"] == str(dashboard_id)


async def test_get_dashboard_context_without_session_dashboard(db):
    policy = build_policy("dashboard_copilot", Scope())
    spec = tool("get_dashboard_context")
    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {})


# ---------------------------------------------------------------------------
# get_dataset_schema / get_column_values
# ---------------------------------------------------------------------------


async def test_get_dataset_schema_normalizes_columns(client, mock_superset_client, db):
    mock_superset_client.get.return_value = {
        "result": {
            "table_name": "municipios",
            "schema": "public",
            "database": {"id": 7},
            "columns": [
                {"column_name": "municipio", "type": "VARCHAR", "is_dttm": False},
                {"column_name": "atualizado_em", "type": "TIMESTAMP", "is_dttm": True},
            ],
        }
    }
    policy = build_policy("dashboard_copilot", Scope(dataset_ids=frozenset({12})))
    spec = tool("get_dataset_schema")

    result = await spec.handler(make_context(db, policy), {})

    assert result["datasetId"] == 12
    assert result["table"] == "municipios"
    assert result["databaseId"] == 7
    assert result["columns"][0] == {
        "name": "municipio",
        "type": "VARCHAR",
        "isDttm": False,
    }
    assert result["columns"][1]["isDttm"] is True


async def test_get_dataset_schema_out_of_scope_is_denied(
    client, mock_superset_client, db
):
    policy = build_policy("dashboard_copilot", Scope(dataset_ids=frozenset({12})))
    spec = tool("get_dataset_schema")

    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {"dataset_id": 999})
    mock_superset_client.get.assert_not_awaited()


async def test_get_column_values_validates_column_name(client, mock_superset_client, db):
    policy = build_policy("dashboard_copilot", Scope(dataset_ids=frozenset({12})))
    spec = tool("get_column_values")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy),
            {"column_name": "1; DROP TABLE usuarios"},
        )
    mock_superset_client.get.assert_not_awaited()


async def test_get_column_values_returns_distinct(client, mock_superset_client, db):
    mock_superset_client.get.return_value = {
        "result": ["São Paulo", "Campinas", "Santos"]
    }
    policy = build_policy("dashboard_copilot", Scope(dataset_ids=frozenset({12})))
    spec = tool("get_column_values")

    result = await spec.handler(
        make_context(db, policy), {"column_name": "municipio", "limit": 2}
    )

    assert result["values"] == ["São Paulo", "Campinas"]
    assert result["count"] == 2
    assert result["truncated"] is True


# ---------------------------------------------------------------------------
# create_analysis (escrita)
# ---------------------------------------------------------------------------


async def test_create_analysis_persists_with_session_scope(db):
    user = User(username=f"ai-{uuid.uuid4().hex[:8]}", full_name="AI Tester")
    db.add(user)
    db.commit()

    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer",
        policy=policy,
        user_id=user.id,
        session_id=uuid.uuid4(),
        db=db,
    )
    spec = tool("create_analysis")

    result = await spec.handler(
        context,
        {"name": "Internações 2024", "sql": "SELECT * FROM internacoes"},
    )

    analysis = db.get(Analysis, uuid.UUID(result["analysisId"]))
    assert analysis is not None
    assert analysis.name == "Internações 2024"
    assert analysis.database_id == 7
    assert analysis.dataset_id == 12
    assert analysis.created_by == user.id


async def test_create_analysis_ignores_llm_ids_outside_scope(db):
    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer", policy=policy, session_id=uuid.uuid4(), db=db
    )
    spec = tool("create_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {"name": "X", "dataset_id": 999, "database_id": 999},
        )


async def test_create_analysis_blocks_dml_sql(db):
    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer", policy=policy, session_id=uuid.uuid4(), db=db
    )
    spec = tool("create_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context, {"name": "X", "sql": "DELETE FROM internacoes"}
        )
    assert db.scalar(select(Analysis).where(Analysis.name == "X")) is None


async def test_create_analysis_requires_name(db):
    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer", policy=policy, session_id=uuid.uuid4(), db=db
    )
    spec = tool("create_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {})


# ---------------------------------------------------------------------------
# update_widget_config (escrita) + widget exposto no contexto
# ---------------------------------------------------------------------------


def first_widget(db, dashboard_id: uuid.UUID) -> DashboardWidget:
    row = db.scalar(
        select(DashboardWidget).where(
            DashboardWidget.dashboard_id == dashboard_id
        )
    )
    assert row is not None
    return row


async def test_get_dashboard_context_includes_widget_id_and_config(db):
    dashboard_id, _ = seed_dashboard(
        db, widget_config={"type": "bar", "legend": True}
    )
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("get_dashboard_context")

    result = await spec.handler(make_context(db, policy), {})

    widget = result["widgets"][0]
    assert widget["id"] == str(first_widget(db, dashboard_id).id)
    assert widget["widget"] == {"type": "bar", "legend": True}


async def test_get_dashboard_context_defaults_empty_widget_config(db):
    dashboard_id, _ = seed_dashboard(db)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("get_dashboard_context")

    result = await spec.handler(make_context(db, policy), {})

    assert result["widgets"][0]["widget"] == {}


async def test_update_widget_config_persists_valid_config(db):
    dashboard_id, analysis_id = seed_dashboard(db, widget_config={"type": "bar"})
    row = first_widget(db, dashboard_id)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("update_widget_config")

    result = await spec.handler(
        make_context(db, policy),
        {
            "widget_id": str(row.id),
            "config": {
                "type": "line",
                "title": "Novo título",
                "encoding": {"x": "municipio", "y": "count"},
                "limit": 25,
            },
        },
    )

    assert result["updated"] is True
    assert result["widgetId"] == str(row.id)
    assert result["analysisId"] == str(analysis_id)
    assert result["widget"]["type"] == "line"

    db.refresh(row)
    assert row.widget["type"] == "line"
    assert row.widget["title"] == "Novo título"
    assert row.widget["encoding"] == {"x": "municipio", "y": "count"}
    assert row.widget["limit"] == 25


async def test_update_widget_config_rejects_widget_outside_session_dashboard(db):
    dashboard_id, _ = seed_dashboard(db)
    other_dashboard_id, _ = seed_dashboard(db)
    other_widget = first_widget(db, other_dashboard_id)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("update_widget_config")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy),
            {"widget_id": str(other_widget.id), "config": {"type": "pie"}},
        )


async def test_update_widget_config_rejects_invalid_config(db):
    dashboard_id, _ = seed_dashboard(db)
    row = first_widget(db, dashboard_id)
    policy = build_policy("dashboard_copilot", Scope(dashboard_id=dashboard_id))
    spec = tool("update_widget_config")
    context = make_context(db, policy)

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {"widget_id": str(row.id), "config": {"type": "tipo-inexistente"}},
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"widget_id": str(row.id), "config": {}})
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"widget_id": str(row.id)})

    db.refresh(row)
    assert row.widget == {}


async def test_update_widget_config_requires_session_dashboard(db):
    policy = build_policy("dashboard_copilot", Scope())
    spec = tool("update_widget_config")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy),
            {"widget_id": str(uuid.uuid4()), "config": {"type": "bar"}},
        )


async def test_update_widget_config_allowed_only_for_copilot():
    registry = build_registry()
    spec = registry.get("update_widget_config")
    assert spec is not None
    assert spec.requires_confirmation is True

    copilot = build_policy("dashboard_copilot", Scope())
    assert registry.resolve("update_widget_config", copilot).name == (
        "update_widget_config"
    )

    explorer = build_policy("explorer", Scope())
    with pytest.raises(ToolNotAllowedError):
        registry.resolve("update_widget_config", explorer)
