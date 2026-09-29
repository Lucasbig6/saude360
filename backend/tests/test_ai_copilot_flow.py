"""E2E do Dashboard Copilot: dashboard real → SSE → tools → LLM → histórico.

Fluxo coberto (sem rede, sem LLM real):

    sessão ancorada no dashboard
        → POST /api/ai/sessions/{id}/messages (SSE)
        → get_dashboard_context (widgets, projeto, filtros)
        → execute_query (escopo do painel, truncamento)
        → resposta final do modelo
        → persistência em ai_messages / ai_tool_calls / audit_logs
"""

from __future__ import annotations

import json
import uuid
from dataclasses import replace

import pytest
from sqlalchemy import select, text

from app.ai import policies as policies_module
from app.db.session import SessionLocal, engine
from app.models import (
    AIMessage,
    AISession,
    AIToolCall,
    Analysis,
    AuditLog,
    Dashboard,
    DashboardFilter,
    DashboardWidget,
    Project,
    User,
)
from tests.conftest import FakeLLMProvider, make_llm_response, make_token, make_tool_call


def truncate_domain() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE ai_tool_calls, ai_messages, ai_sessions, audit_logs, "
                "dashboard_filters, dashboard_widgets, dashboards, analyses, "
                "projects, users CASCADE"
            )
        )




@pytest.fixture(autouse=True)
def reset_domain(migrated_db: str):
    truncate_domain()
    yield
    truncate_domain()


@pytest.fixture
def db(migrated_db: str):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def user_headers(db, username: str) -> dict[str, str]:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, full_name=username)
        db.add(user)
        db.commit()
    return {"Authorization": f"Bearer {make_token(sub=username)}"}


def seed_dashboard(db, owner: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Projeto + dashboard + widget/analysis + filtro. Retorna ids."""
    user = db.scalar(select(User).where(User.username == owner))
    assert user is not None
    project = Project(name="Rede SUS", created_by=user.id)
    db.add(project)
    db.flush()

    analysis = Analysis(
        name="Internações por município",
        sql="SELECT municipio, COUNT(*) AS total FROM internacoes GROUP BY 1",
        database_id=7,
        db_schema="public",
        dataset_id=12,
        chart_type="bar",
        dimension="municipio",
        metric="count",
        created_by=user.id,
    )
    db.add(analysis)
    db.flush()

    dashboard = Dashboard(
        name="Painel de Internações",
        description="Indicadores do SUS",
        slug=f"painel-{uuid.uuid4().hex[:8]}",
        project_id=project.id,
        created_by=user.id,
    )
    db.add(dashboard)
    db.flush()
    db.add(DashboardWidget(dashboard_id=dashboard.id, analysis_id=analysis.id))
    db.add(
        DashboardFilter(
            dashboard_id=dashboard.id,
            dataset_id=12,
            column_name="municipio",
            operator="eq",
            default_value="São Paulo",
            scope="dashboard",
        )
    )
    db.commit()
    return dashboard.id, project.id, analysis.id


def parse_sse(body: str) -> list[tuple[str, dict]]:
    """Converte o corpo SSE em [(evento, payload)]."""
    events: list[tuple[str, dict]] = []
    for block in body.strip().split("\n\n"):
        name = None
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("event: "):
                name = line[len("event: ") :]
            elif line.startswith("data: "):
                data_lines.append(line[len("data: ") :])
        if name is None:
            continue
        payload = json.loads("\n".join(data_lines)) if data_lines else {}
        events.append((name, payload))
    return events


async def create_session(client, headers, dashboard_id: uuid.UUID) -> dict:
    response = await client.post(
        "/api/ai/sessions",
        json={"agentType": "dashboard_copilot", "dashboardId": str(dashboard_id)},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Fluxo completo
# ---------------------------------------------------------------------------


async def test_full_copilot_flow_streams_and_persists(
    client, db, mock_superset_client, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id, project_id, analysis_id = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)

    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["municipio", "total"],
        "data": [
            {"municipio": "São Paulo", "total": 120},
            {"municipio": "Campinas", "total": 80},
        ],
    }
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[make_tool_call("get_dashboard_context", {}, "call_ctx")]
        ),
        make_llm_response(
            tool_calls=[
                make_tool_call(
                    "execute_query",
                    {"sql": "SELECT municipio, COUNT(*) AS total FROM internacoes GROUP BY 1"},
                    "call_q",
                )
            ]
        ),
        make_llm_response(
            content=(
                "As internações somam 200 no recorte consultado "
                "(São Paulo 120; Campinas 80), segundo a consulta do widget "
                "'Internações por município'."
            )
        ),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "Quantas internações por município?"},
        headers=headers,
    )
    assert response.status_code == 200
    events = parse_sse(response.text)
    names = [name for name, _ in events]

    # sequência mínima do contrato SSE
    assert names[0] == "message_start"
    assert names[-1] == "message_complete"
    assert "token" in names
    assert names.count("tool_call") == 2
    assert names.count("tool_result") == 2
    assert "error" not in names

    tool_calls = [data for name, data in events if name == "tool_call"]
    assert [item["name"] for item in tool_calls] == [
        "get_dashboard_context",
        "execute_query",
    ]

    tool_results = {data["toolCallId"]: data for name, data in events if name == "tool_result"}
    context_result = tool_results["call_ctx"]["data"]
    assert context_result["dashboard"]["id"] == str(dashboard_id)
    assert context_result["project"] == {"id": str(project_id), "name": "Rede SUS"}
    assert context_result["filters"][0]["column"] == "municipio"
    widget = context_result["widgets"][0]
    assert widget["analysisId"] == str(analysis_id)
    assert widget["datasetId"] == 12
    assert widget["databaseId"] == 7

    query_result = tool_results["call_q"]["data"]
    assert query_result["columns"] == ["municipio", "total"]
    assert query_result["rowCount"] == 2
    assert query_result["truncated"] is False
    assert query_result["databaseId"] == 7

    # tokens chegam progressivamente e a resposta final fecha o turno
    tokens = [data["delta"] for name, data in events if name == "token"]
    final = next(data for name, data in events if name == "message_complete")
    assert "".join(tokens) == final["content"]
    assert "200" in final["content"]

    # sessão vinculada ao dashboard correto + histórico persistido
    session_row = db.get(AISession, uuid.UUID(session["id"]))
    assert session_row is not None
    assert session_row.dashboard_id == dashboard_id

    messages = db.scalars(
        select(AIMessage)
        .where(AIMessage.session_id == session_row.id)
        .order_by(AIMessage.created_at, AIMessage.id)
    ).all()
    assert [row.role for row in messages] == [
        "user",
        "assistant",
        "tool",
        "assistant",
        "tool",
        "assistant",
    ]
    assert messages[0].content == "Quantas internações por município?"
    assert messages[-1].content == final["content"]

    tool_rows = db.scalars(
        select(AIToolCall).where(AIToolCall.session_id == session_row.id)
    ).all()
    assert {row.tool_name for row in tool_rows} == {
        "get_dashboard_context",
        "execute_query",
    }
    for row in tool_rows:
        assert row.status == "ok"
        assert row.duration_ms is not None

    # auditoria: um turno + um evento por tool call, sem texto de SQL
    actions = set(
        db.scalars(
            select(AuditLog.action).where(AuditLog.resource_id == session_row.id)
        ).all()
    )
    assert actions == {"ai.turn", "ai.tool_call"}
    for log in db.scalars(
        select(AuditLog).where(
            AuditLog.action == "ai.tool_call",
            AuditLog.resource_id == session_row.id,
        )
    ).all():
        assert "sql" not in log.data


async def test_history_survives_reload(
    client, db, mock_superset_client, override_llm_provider
):
    """Critério 11 (passos 9-10): histórico recuperável após recarregar."""
    headers = user_headers(db, "alice")
    dashboard_id, _, _ = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)
    override_llm_provider._responses = [make_llm_response(content="ola")]

    await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "Bom dia"},
        headers=headers,
    )

    # "reload": lista sessões do dashboard e lê as mensagens de volta
    listing = await client.get(
        "/api/ai/sessions",
        params={"dashboardId": str(dashboard_id)},
        headers=headers,
    )
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()] == [session["id"]]

    history = await client.get(
        f"/api/ai/sessions/{session['id']}/messages", headers=headers
    )
    assert history.status_code == 200
    data = history.json()
    assert [item["role"] for item in data] == ["user", "assistant"]
    assert data[0]["content"] == "Bom dia"
    assert data[1]["content"] == "ola"


# ---------------------------------------------------------------------------
# Evidência e segurança do agente
# ---------------------------------------------------------------------------


async def test_truncated_result_is_reported_to_the_agent(
    client, db, mock_superset_client, override_llm_provider, monkeypatch
):
    template = policies_module.AGENT_POLICIES["dashboard_copilot"]
    monkeypatch.setattr(
        policies_module,
        "AGENT_POLICIES",
        {"dashboard_copilot": replace(template, max_rows=2)},
    )

    headers = user_headers(db, "alice")
    dashboard_id, _, _ = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)

    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["n"],
        "data": [{"n": 1}, {"n": 2}, {"n": 3}, {"n": 4}, {"n": 5}],
    }
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call("execute_query", {"sql": "SELECT n FROM t"}, "call_t")
            ]
        ),
        make_llm_response(content="amostra de 2 linhas (truncada)."),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "liste"},
        headers=headers,
    )
    events = parse_sse(response.text)
    result = next(data for name, data in events if name == "tool_result")
    assert result["data"]["truncated"] is True
    assert len(result["data"]["rows"]) == 2

    # a mensagem de tool (o que o LLM lê) carrega o flag de truncamento
    tool_message = db.scalar(
        select(AIMessage).where(
            AIMessage.session_id == uuid.UUID(session["id"]),
            AIMessage.role == "tool",
        )
    )
    assert tool_message is not None
    assert '"truncated": true' in tool_message.content


async def test_llm_database_id_cannot_escape_session_scope(
    client, db, mock_superset_client, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id, _, _ = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call(
                    "execute_query",
                    {"sql": "SELECT 1", "database_id": 999},
                    "call_esc",
                )
            ]
        ),
        make_llm_response(content="não posso consultar esse banco."),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "consulta fora do escopo"},
        headers=headers,
    )
    events = parse_sse(response.text)
    result = next(data for name, data in events if name == "tool_result")
    assert result["status"] == "denied"
    mock_superset_client.post.assert_not_awaited()


async def test_dml_is_blocked_in_the_stream(
    client, db, mock_superset_client, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id, _, _ = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call(
                    "execute_query",
                    {"sql": "DELETE FROM internacoes"},
                    "call_dml",
                )
            ]
        ),
        make_llm_response(content="consultas de escrita não são permitidas."),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "apague tudo"},
        headers=headers,
    )
    events = parse_sse(response.text)
    result = next(data for name, data in events if name == "tool_result")
    assert result["status"] == "denied"
    mock_superset_client.post.assert_not_awaited()


async def test_provider_failure_emits_error_event(
    client, db, override_llm_provider
):
    class ExplodingProvider(FakeLLMProvider):
        async def chat_stream(self, messages, tools):  # noqa: ANN001
            raise RuntimeError("provider indisponível")
            yield  # pragma: no cover

    headers = user_headers(db, "alice")
    dashboard_id, _, _ = seed_dashboard(db, owner="alice")
    session = await create_session(client, headers, dashboard_id)
    override_llm_provider.__class__ = ExplodingProvider

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "olá"},
        headers=headers,
    )
    events = parse_sse(response.text)
    assert events[0][0] == "message_start"
    assert any(name == "error" for name, _ in events)
