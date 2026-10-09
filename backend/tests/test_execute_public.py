from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal, engine
from app.models import Analysis, Dashboard, DashboardWidget


def truncate_domain() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE dashboard_filters, dashboard_widgets, dashboards, "
                "analyses CASCADE"
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


def seed_public_analysis(db, *, sql="SELECT municipio FROM x", database_id=7) -> uuid.UUID:
    analysis = Analysis(name="Pub", sql=sql, database_id=database_id, db_schema="public")
    db.add(analysis)
    db.flush()
    dashboard = Dashboard(name="P", slug=f"p-{uuid.uuid4().hex[:8]}")
    db.add(dashboard)
    db.flush()
    db.add(DashboardWidget(dashboard_id=dashboard.id, analysis_id=analysis.id))
    db.commit()
    return analysis.id


@pytest.mark.asyncio
async def test_execute_public_uses_saved_sql(client, db, mock_superset_client):
    mock_superset_client.post.return_value = {"status": "success", "data": []}
    analysis_id = seed_public_analysis(db)

    # Tenta injetar SQL arbitrário — backend deve ignorar e usar o salvo.
    response = await client.post(
        "/api/queries/execute-public",
        json={"analysis_id": str(analysis_id), "filters": []},
    )
    assert response.status_code == 200, response.text
    assert mock_superset_client.post.await_count == 1
    payload = mock_superset_client.post.await_args.kwargs.get("json", {})
    assert payload.get("sql") == "SELECT municipio FROM x"
    assert payload.get("database_id") == 7


@pytest.mark.asyncio
async def test_execute_public_rejects_unknown_analysis(client, db, mock_superset_client):
    response = await client.post(
        "/api/queries/execute-public",
        json={"analysis_id": str(uuid.uuid4())},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_execute_public_rejects_analysis_without_widget(
    client, db, mock_superset_client
):
    analysis = Analysis(name="Solta", sql="SELECT 1", database_id=1)
    db.add(analysis)
    db.commit()
    response = await client.post(
        "/api/queries/execute-public",
        json={"analysis_id": str(analysis.id)},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_execute_public_applies_filters_to_saved_sql(
    client, db, mock_superset_client
):
    mock_superset_client.post.return_value = {"status": "success", "data": []}
    analysis_id = seed_public_analysis(
        db, sql="SELECT municipio FROM x", database_id=7
    )
    response = await client.post(
        "/api/queries/execute-public",
        json={
            "analysis_id": str(analysis_id),
            "filters": [{"column": "municipio", "operator": "eq", "values": "SP"}],
        },
    )
    assert response.status_code == 200, response.text
    payload = mock_superset_client.post.await_args.kwargs.get("json", {})
    assert "WHERE" in payload.get("sql", "")


@pytest.mark.asyncio
async def test_execute_public_legacy_payload_without_sql_field_is_rejected_by_schema(
    client, db, mock_superset_client
):
    # Contrato novo: sem sql/database_id no request — se cliente antigo enviar,
    # campos extras são ignorados, não executados.
    mock_superset_client.post.return_value = {"status": "success", "data": []}
    analysis_id = seed_public_analysis(db)
    response = await client.post(
        "/api/queries/execute-public",
        json={
            "analysis_id": str(analysis_id),
            "sql": "SELECT 999 FROM evil",
            "database_id": 999,
        },
    )
    assert response.status_code == 200, response.text
    payload = mock_superset_client.post.await_args.kwargs.get("json", {})
    assert payload.get("database_id") == 7
    assert "evil" not in payload.get("sql", "")
