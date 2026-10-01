from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, text

from app.core.config import settings as app_settings
from app.db.session import SessionLocal, engine
from app.models import (
    AIMessage,
    AISession,
    AIToolCall,
    Analysis,
    AuditLog,
    Dashboard,
    DashboardWidget,
    User,
)
from tests.conftest import make_llm_response, make_token, make_tool_call


def truncate_domain() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE ai_tool_calls, ai_messages, ai_sessions, audit_logs, "
                "dashboard_filters, dashboard_widgets, dashboards, analyses, "
                "users CASCADE"
            )
        )


@pytest.fixture(autouse=True)
def reset_domain(migrated_db: str):
    """Zera domínio + tabelas de IA antes/depois de cada teste."""
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


def seed_dashboard(db, owner: str | None = None) -> uuid.UUID:
    owner_id = None
    if owner is not None:
        user = db.scalar(select(User).where(User.username == owner))
        if user is None:
            user = User(username=owner, full_name=owner)
            db.add(user)
            db.flush()
        owner_id = user.id
    analysis = Analysis(
        name="Internações",
        sql="SELECT municipio, COUNT(*) AS total FROM internacoes GROUP BY 1",
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
        name="Painel de Internações",
        description="Indicadores do SUS",
        slug=f"painel-{uuid.uuid4().hex[:8]}",
        created_by=owner_id,
    )
    db.add(dashboard)
    db.flush()
    db.add(DashboardWidget(dashboard_id=dashboard.id, analysis_id=analysis.id))
    db.commit()
    return dashboard.id


async def create_session(client, headers, **overrides) -> dict:
    payload = {"agentType": "dashboard_copilot", **overrides}
    response = await client.post("/api/ai/sessions", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Sessões
# ---------------------------------------------------------------------------


async def test_create_session_records_provider_and_model(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)

    data = await create_session(
        client, headers, dashboardId=str(dashboard_id), title="Copiloto"
    )

    assert data["agentType"] == "dashboard_copilot"
    assert data["provider"] == "fake"
    assert data["model"] == "fake-model"
    assert data["dashboardId"] == str(dashboard_id)
    assert data["title"] == "Copiloto"
    uuid.UUID(data["id"])

    stored = db.get(AISession, uuid.UUID(data["id"]))
    assert stored is not None
    assert stored.provider == "fake"
    assert stored.model == "fake-model"
    assert stored.agent_type == "dashboard_copilot"


async def test_create_session_requires_auth(client, db, override_llm_provider):
    dashboard_id = seed_dashboard(db)
    response = await client.post(
        "/api/ai/sessions",
        json={"agentType": "dashboard_copilot", "dashboardId": str(dashboard_id)},
    )
    assert response.status_code == 422


async def test_create_copilot_session_requires_dashboard(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    response = await client.post(
        "/api/ai/sessions", json={"agentType": "dashboard_copilot"}, headers=headers
    )
    assert response.status_code == 422


async def test_create_copilot_session_validates_dashboard_exists(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    response = await client.post(
        "/api/ai/sessions",
        json={
            "agentType": "dashboard_copilot",
            "dashboardId": str(uuid.uuid4()),
        },
        headers=headers,
    )
    assert response.status_code == 404


async def test_create_session_blocks_dashboard_of_another_user(
    client, db, override_llm_provider
):
    alice = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db, owner="bob")

    response = await client.post(
        "/api/ai/sessions",
        json={
            "agentType": "dashboard_copilot",
            "dashboardId": str(dashboard_id),
        },
        headers=alice,
    )
    assert response.status_code == 403


async def test_list_sessions_returns_only_own_sessions(
    client, db, override_llm_provider
):
    alice = user_headers(db, "alice")
    bob = user_headers(db, "bob")
    # dashboard sem dono: ambos podem criar sessões, mas cada um vê as suas
    dashboard_id = seed_dashboard(db)

    mine = await create_session(client, alice, dashboardId=str(dashboard_id))
    theirs = await create_session(client, bob, dashboardId=str(dashboard_id))

    response = await client.get(
        "/api/ai/sessions",
        params={"dashboardId": str(dashboard_id)},
        headers=alice,
    )
    assert response.status_code == 200
    data = response.json()
    assert [item["id"] for item in data] == [mine["id"]]

    # bob não enxerga a sessão de alice
    response = await client.get(
        "/api/ai/sessions",
        params={"dashboardId": str(dashboard_id)},
        headers=bob,
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [theirs["id"]]


async def test_list_sessions_requires_dashboard_id(client, db, override_llm_provider):
    headers = user_headers(db, "alice")
    response = await client.get("/api/ai/sessions", headers=headers)
    assert response.status_code == 422


async def test_list_sessions_blocks_dashboard_of_another_user(
    client, db, override_llm_provider
):
    alice = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db, owner="bob")
    response = await client.get(
        "/api/ai/sessions",
        params={"dashboardId": str(dashboard_id)},
        headers=alice,
    )
    assert response.status_code == 403


async def test_create_explorer_session_requires_dataset(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    response = await client.post(
        "/api/ai/sessions", json={"agentType": "explorer"}, headers=headers
    )
    assert response.status_code == 422


async def test_session_is_invisible_to_other_user(
    client, db, override_llm_provider
):
    alice = user_headers(db, "alice")
    bob = user_headers(db, "bob")
    dashboard_id = seed_dashboard(db)
    data = await create_session(client, alice, dashboardId=str(dashboard_id))

    response = await client.get(f"/api/ai/sessions/{data['id']}", headers=bob)
    assert response.status_code == 404

    response = await client.get(
        f"/api/ai/sessions/{data['id']}/messages", headers=bob
    )
    assert response.status_code == 404


async def test_unknown_session_is_404(client, db, override_llm_provider):
    headers = user_headers(db, "alice")
    response = await client.get(f"/api/ai/sessions/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


async def test_create_session_without_provider_configured_is_503(
    client, db, monkeypatch
):
    """Sem AI_* configurado a sessão responde 503 com o motivo (sem segredos)."""
    # Isola do .env local: sem base_url/modelo o provider não é configurado.
    monkeypatch.setattr(app_settings, "ai_base_url", "")
    monkeypatch.setattr(app_settings, "ai_model", "")
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    response = await client.post(
        "/api/ai/sessions",
        json={"agentType": "dashboard_copilot", "dashboardId": str(dashboard_id)},
        headers=headers,
    )
    assert response.status_code == 503
    assert "AI_" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Mensagens — streaming SSE
# ---------------------------------------------------------------------------


async def test_post_message_streams_text_and_persists(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [
        make_llm_response(content="O painel tem um widget de internações.")
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "O que este painel mostra?"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: message_start" in body
    assert "event: token" in body
    assert "event: message_complete" in body
    assert "O painel tem um widget" in body
    assert "event: tool_call" not in body

    rows = db.scalars(
        select(AIMessage)
        .where(AIMessage.session_id == uuid.UUID(session["id"]))
        .order_by(AIMessage.created_at, AIMessage.id)
    ).all()
    assert [row.role for row in rows] == ["user", "assistant"]
    assert rows[0].content == "O que este painel mostra?"
    assert rows[1].content == "O painel tem um widget de internações."
    assert rows[1].status == "complete"


async def test_post_message_empty_body_is_422(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages", json={}, headers=headers
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Mensagens — tool calling
# ---------------------------------------------------------------------------


async def test_post_message_executes_tool_and_persists_tool_call(
    client, db, mock_superset_client, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call("get_dashboard_context", {}, "call_ctx")
            ]
        ),
        make_llm_response(content="O painel traz 1 widget."),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "Resuma o painel"},
        headers=headers,
    )

    body = response.text
    assert "event: tool_call" in body
    assert "event: tool_result" in body
    assert '"name": "get_dashboard_context"' in body
    assert "O painel traz 1 widget" in body

    session_id = uuid.UUID(session["id"])
    tool_row = db.scalar(select(AIToolCall).where(AIToolCall.session_id == session_id))
    assert tool_row is not None
    assert tool_row.tool_name == "get_dashboard_context"
    assert tool_row.tool_call_id == "call_ctx"
    assert tool_row.status == "ok"
    assert tool_row.duration_ms is not None
    assert tool_row.result["dashboard"]["id"] == str(dashboard_id)

    messages = db.scalars(
        select(AIMessage)
        .where(AIMessage.session_id == session_id)
        .order_by(AIMessage.created_at, AIMessage.id)
    ).all()
    roles = [row.role for row in messages]
    assert roles == ["user", "assistant", "tool", "assistant"]
    tool_message = next(row for row in messages if row.role == "tool")
    assert tool_message.status == "ok"
    assert tool_message.tool_call_id == "call_ctx"
    assert tool_message.tool_name == "get_dashboard_context"
    assistant_with_tools = messages[1]
    assert assistant_with_tools.data["toolCalls"] == [
        {"id": "call_ctx", "name": "get_dashboard_context", "arguments": {}}
    ]


async def test_execute_query_tool_call_is_audited_without_sql_text(
    client, db, mock_superset_client, override_llm_provider
):
    mock_superset_client.post.return_value = {
        "status": "success",
        "colnames": ["total"],
        "data": [{"total": 42}],
    }
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call(
                    "execute_query",
                    {"sql": "SELECT COUNT(*) AS total FROM internacoes"},
                    "call_q",
                )
            ]
        ),
        make_llm_response(content="42 internações."),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "Quantas internações?"},
        headers=headers,
    )
    assert "event: tool_result" in response.text

    session_id = uuid.UUID(session["id"])
    logs = db.scalars(
        select(AuditLog).where(
            AuditLog.action == "ai.tool_call",
            AuditLog.resource_id == session_id,
        )
    ).all()
    assert logs, "tool call deve gerar evento de auditoria"
    data = logs[0].data
    assert data["tool"] == "execute_query"
    assert data["status"] == "ok"
    assert data["provider"] == "fake"
    assert data["model"] == "fake-model"
    assert data["agentType"] == "dashboard_copilot"
    assert data["databaseId"] == 7
    # AI_AUDIT_STORE_SQL=false (padrão): guarda hash, nunca o texto do SQL
    assert "sql" not in data
    assert data["sqlSha256"]


async def test_turn_writes_ai_turn_audit_event(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [make_llm_response(content="ok")]

    await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "oi"},
        headers=headers,
    )

    log = db.scalar(
        select(AuditLog).where(
            AuditLog.action == "ai.turn",
            AuditLog.resource_id == uuid.UUID(session["id"]),
        )
    )
    assert log is not None
    assert log.data["provider"] == "fake"
    assert log.data["agentType"] == "dashboard_copilot"
    assert "durationMs" in log.data


async def test_get_messages_returns_history(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [make_llm_response(content="olá")]

    await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "bom dia"},
        headers=headers,
    )
    response = await client.get(
        f"/api/ai/sessions/{session['id']}/messages", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert [item["role"] for item in data] == ["user", "assistant"]
    assert data[0]["content"] == "bom dia"
    assert data[1]["content"] == "olá"
    assert data[0]["sessionId"] == session["id"]


# ---------------------------------------------------------------------------
# Confirmação de escrita (vinculada ao tool_call_id)
# ---------------------------------------------------------------------------


async def test_write_tool_flow_requires_confirmation_then_executes(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    session = await create_session(client, headers, agentType="explorer", datasetId=12)
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call(
                    "create_analysis",
                    {"name": "Internações por município", "sql": "SELECT 1"},
                    "call_save",
                )
            ]
        )
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "Salve essa análise"},
        headers=headers,
    )

    body = response.text
    assert "event: confirmation_required" in body
    assert '"toolCallId": "call_save"' in body
    assert db.scalar(select(Analysis).where(Analysis.name == "Internações por município")) is None

    session_id = uuid.UUID(session["id"])
    pending = db.scalar(
        select(AIMessage).where(
            AIMessage.session_id == session_id,
            AIMessage.role == "tool",
            AIMessage.tool_call_id == "call_save",
        )
    )
    assert pending is not None
    assert pending.status == "pending_confirmation"

    tool_row = db.scalar(
        select(AIToolCall).where(AIToolCall.tool_call_id == "call_save")
    )
    assert tool_row is not None
    assert tool_row.status == "pending_confirmation"
    assert tool_row.arguments["name"] == "Internações por município"

    # --- confirmação -------------------------------------------------
    confirm = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"confirmToolCallIds": ["call_save"]},
        headers=headers,
    )
    assert confirm.status_code == 200
    assert "event: message_complete" in confirm.text

    analysis = db.scalar(
        select(Analysis).where(Analysis.name == "Internações por município")
    )
    assert analysis is not None
    assert analysis.dataset_id == 12

    db.refresh(pending)
    assert pending.status == "ok"
    db.refresh(tool_row)
    assert tool_row.status == "ok"
    assert tool_row.result["created"] is True


async def test_confirmation_with_unknown_tool_call_id_is_400(
    client, db, override_llm_provider
):
    headers = user_headers(db, "alice")
    session = await create_session(client, headers, agentType="explorer", datasetId=12)

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"confirmToolCallIds": ["call_inexistente"]},
        headers=headers,
    )
    assert response.status_code == 400
    assert "call_inexistente" in response.json()["detail"]


async def test_copilot_session_cannot_use_write_tool(
    client, db, override_llm_provider
):
    """Mesmo que a LLM peça create_analysis, o copiloto não a executa."""
    headers = user_headers(db, "alice")
    dashboard_id = seed_dashboard(db)
    session = await create_session(client, headers, dashboardId=str(dashboard_id))
    override_llm_provider._responses = [
        make_llm_response(
            tool_calls=[
                make_tool_call("create_analysis", {"name": "X"}, "call_x")
            ]
        ),
        make_llm_response(content="não posso criar análises"),
    ]

    response = await client.post(
        f"/api/ai/sessions/{session['id']}/messages",
        json={"content": "crie uma análise"},
        headers=headers,
    )

    assert '"status": "denied"' in response.text
    assert db.scalar(select(Analysis).where(Analysis.name == "X")) is None
