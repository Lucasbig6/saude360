from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.ai.policies import Scope, ToolPolicyError, build_policy
from app.ai.tools import build_registry
from app.ai.tools.registry import ToolContext, ToolNotAllowedError
from app.db.session import SessionLocal
from app.models import AIToolCall, Analysis, Dashboard, DashboardWidget, User


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


# ---------------------------------------------------------------------------
# Schemas nullable (Groq valida tool calls no servidor)
# ---------------------------------------------------------------------------


def test_nullable_helper_accepts_null_and_is_idempotent():
    from app.ai.tools.registry import nullable

    schema = nullable({"type": "integer"})
    assert {"type": "null"} in schema["anyOf"]
    assert {"type": "integer"} in schema["anyOf"]
    assert nullable(schema) is schema


def test_optional_tool_params_accept_null():
    """Todo parâmetro não-obrigatório deve aceitar null (anyOf).

    O Groq rejeita a requisição inteira (tool_use_failed) quando o modelo
    envia null para um campo opcional tipado de forma estrita — e o modelo
    faz isso para ids resolvidos pelo escopo do backend.
    """
    registry = build_registry()
    specs = registry.all()
    assert specs, "registry sem tools"
    for spec in specs:
        schema = spec.input_schema
        required = set(schema.get("required") or [])
        for name, prop in (schema.get("properties") or {}).items():
            if name in required:
                continue
            assert isinstance(prop, dict) and any(
                isinstance(branch, dict) and branch.get("type") == "null"
                for branch in prop.get("anyOf", [])
            ), f"{spec.name}.{name} deve aceitar null"


# ---------------------------------------------------------------------------
# preview_analysis — contrato estruturado agente → frontend
# ---------------------------------------------------------------------------


def explorer_policy(**scope_kwargs) -> tuple:
    policy = build_policy("explorer", Scope(**scope_kwargs))
    return policy


async def test_preview_analysis_returns_config_and_data_together(
    client, mock_superset_client, db
):
    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["municipio", "total"],
        "data": [
            {"municipio": "São Paulo", "total": 10},
            {"municipio": "Campinas", "total": 5},
        ],
    }
    policy = explorer_policy(database_ids=frozenset({7}))
    spec = tool("preview_analysis")

    result = await spec.handler(
        make_context(db, policy),
        {
            "sql": "SELECT municipio, SUM(valor) AS total FROM atendimentos "
            "WHERE ano = 2025 GROUP BY 1",
            "chart_type": "bar-horizontal",
            "dimension": "municipio",
            "metric": "total",
            "sort": {"field": "total", "direction": "desc"},
            "limit": 20,
            "filters": [{"field": "ano", "operator": "eq", "value": 2025}],
            "show_values": True,
        },
    )

    config = result["config"]
    data = result["data"]
    assert config["sql"].startswith("SELECT municipio")
    assert config["chartType"] == "bar-horizontal"
    assert config["dimension"] == "municipio"
    assert config["metric"] == "total"
    assert config["colorField"] is None
    assert config["sort"] == {"field": "total", "direction": "desc"}
    assert config["limit"] == 20
    assert config["filters"] == [
        {"field": "ano", "operator": "eq", "value": 2025}
    ]
    assert config["showValues"] is True
    assert data["columns"] == ["municipio", "total"]
    assert len(data["rows"]) == 2
    assert data["truncated"] is False
    assert data["databaseId"] == 7
    mock_superset_client.post.assert_awaited_once()


async def test_preview_analysis_blocks_dml_without_calling_superset(
    client, mock_superset_client, db
):
    policy = explorer_policy(database_ids=frozenset({7}))
    spec = tool("preview_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy), {"sql": "DELETE FROM atendimentos"}
        )
    mock_superset_client.post.assert_not_awaited()


async def test_preview_analysis_requires_database_scope(
    client, mock_superset_client, db
):
    policy = explorer_policy()  # sem escopo de database
    spec = tool("preview_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(make_context(db, policy), {"sql": "SELECT 1"})
    mock_superset_client.post.assert_not_awaited()


async def test_preview_analysis_rejects_llm_database_out_of_scope(
    client, mock_superset_client, db
):
    policy = explorer_policy(database_ids=frozenset({7}))
    spec = tool("preview_analysis")

    with pytest.raises(ToolPolicyError):
        await spec.handler(
            make_context(db, policy), {"sql": "SELECT 1", "database_id": 999}
        )
    mock_superset_client.post.assert_not_awaited()


async def test_preview_analysis_rejects_invalid_config_args(
    client, mock_superset_client, db
):
    policy = explorer_policy(database_ids=frozenset({7}))
    spec = tool("preview_analysis")
    context = make_context(db, policy)

    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"sql": "SELECT 1", "chart_type": "pie3d"})
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {"sql": "SELECT 1", "sort": {"field": "total", "direction": "up"}},
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context, {"sql": "SELECT 1", "sort": {"direction": "asc"}}
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"sql": "SELECT 1", "limit": 0})
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"sql": "SELECT 1", "limit": 99999})
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {
                "sql": "SELECT 1",
                "filters": [{"field": "ano", "operator": "regex", "value": "2"}],
            },
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context, {"sql": "SELECT 1", "show_values": "yes"}
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {"filters": [{"field": "ano", "operator": "eq"}]}
        )
    mock_superset_client.post.assert_not_awaited()


async def test_preview_analysis_truncates_to_policy_max_rows(
    client, mock_superset_client, db
):
    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["n"],
        "data": [{"n": 1}, {"n": 2}, {"n": 3}],
    }
    policy = build_policy(
        "explorer", Scope(database_ids=frozenset({7})), max_rows=2
    )
    spec = tool("preview_analysis")

    result = await spec.handler(
        make_context(db, policy), {"sql": "SELECT n FROM t"}
    )

    assert len(result["data"]["rows"]) == 2
    assert result["data"]["rowCount"] == 3
    assert result["data"]["truncated"] is True
    assert result["config"]["chartType"] == "bar"


def test_preview_analysis_not_allowed_for_copilot():
    registry = build_registry()
    spec = registry.get("preview_analysis")
    assert spec is not None
    assert spec.requires_confirmation is False

    copilot = build_policy("dashboard_copilot", Scope())
    with pytest.raises(ToolNotAllowedError):
        registry.resolve("preview_analysis", copilot)

    explorer = build_policy("explorer", Scope())
    assert registry.resolve("preview_analysis", explorer).name == (
        "preview_analysis"
    )


# ---------------------------------------------------------------------------
# create_analysis — chart_config estendido (encoding/sort/limit/filters)
# ---------------------------------------------------------------------------


async def test_create_analysis_persists_extended_chart_config(db):
    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer", policy=policy, session_id=uuid.uuid4(), db=db
    )
    spec = tool("create_analysis")

    result = await spec.handler(
        context,
        {
            "name": "Internações por município",
            "sql": "SELECT municipio, SUM(valor) FROM i GROUP BY 1",
            "chart_type": "bar-horizontal",
            "dimension": "municipio",
            "metric": "total",
            "color_field": "regiao",
            "sort": {"field": "total", "direction": "desc"},
            "limit": 15,
            "filters": [{"field": "ano", "operator": "eq", "value": 2025}],
            "show_values": True,
        },
    )

    analysis = db.get(Analysis, uuid.UUID(result["analysisId"]))
    assert analysis is not None
    assert analysis.chart_type == "bar-horizontal"
    assert analysis.chart_config["type"] == "bar-horizontal"
    assert analysis.chart_config["encoding"] == {
        "x": "municipio",
        "y": "total",
        "color": "regiao",
    }
    assert analysis.chart_config["sort"] == {
        "field": "total",
        "direction": "desc",
    }
    assert analysis.chart_config["limit"] == 15
    assert analysis.chart_config["filters"] == [
        {"field": "ano", "operator": "eq", "value": 2025}
    ]
    assert analysis.chart_config["showValues"] is True


async def test_create_analysis_kpi_saved_as_bar_config(db):
    policy = build_policy(
        "explorer",
        Scope(dataset_ids=frozenset({12}), database_ids=frozenset({7})),
    )
    context = ToolContext(
        agent_type="explorer", policy=policy, session_id=uuid.uuid4(), db=db
    )
    spec = tool("create_analysis")

    result = await spec.handler(
        context,
        {"name": "Total 2025", "sql": "SELECT SUM(x) FROM t", "chart_type": "kpi"},
    )

    analysis = db.get(Analysis, uuid.UUID(result["analysisId"]))
    assert analysis is not None
    assert analysis.chart_type == "kpi"
    assert analysis.chart_config["type"] == "bar"


async def test_create_analysis_rejects_invalid_extended_args(db):
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
            {
                "name": "X",
                "filters": [{"field": "ano", "operator": "regex"}],
            },
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(
            context,
            {"name": "X", "sort": {"field": "total", "direction": "sideways"}},
        )
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"name": "X", "limit": 100000})
    with pytest.raises(ToolPolicyError):
        await spec.handler(context, {"name": "X", "show_values": "true"})
    assert db.scalar(select(Analysis).where(Analysis.name == "X")) is None


# ---------------------------------------------------------------------------
# Contexto do turno — "análise em edição" injetada no histórico
# ---------------------------------------------------------------------------


def test_analysis_context_message_uses_latest_ok_preview(db):
    from datetime import datetime, timedelta, timezone

    from app.ai.service import analysis_context_message
    from app.models import AISession

    session = AISession(agent_type="explorer", data={})
    db.add(session)
    db.flush()

    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    db.add(
        AIToolCall(
            session_id=session.id,
            tool_name="preview_analysis",
            arguments={"sql": "SELECT 1"},
            result={"config": {"chartType": "line", "dimension": "municipio"}},
            status="ok",
            created_at=base,
        )
    )
    db.add(
        AIToolCall(
            session_id=session.id,
            tool_name="preview_analysis",
            arguments={"sql": "SELECT 2"},
            result={"config": {"chartType": "bar-horizontal", "metric": "total"}},
            status="ok",
            created_at=base + timedelta(minutes=5),
        )
    )
    db.add(
        AIToolCall(
            session_id=session.id,
            tool_name="preview_analysis",
            arguments={"sql": "SELECT 3"},
            result={"config": {"chartType": "pie"}},
            status="error",
            created_at=base + timedelta(minutes=10),
        )
    )
    db.commit()

    message = analysis_context_message(db, session.id)
    assert message is not None
    assert message.role == "system"
    assert "Análise atual em edição" in message.content
    assert "bar-horizontal" in message.content
    # a chamada mais recente com status ok vence (a 'error' é ignorada)
    assert '"chartType": "pie"' not in message.content


def test_analysis_context_message_without_preview_returns_none(db):
    from app.ai.service import analysis_context_message
    from app.models import AISession

    session = AISession(agent_type="explorer", data={})
    db.add(session)
    db.commit()

    assert analysis_context_message(db, session.id) is None
