from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, text

from app.db.session import SessionLocal, engine
from app.models import Analysis, Dashboard, User
from tests.conftest import make_token


def truncate_domain() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE dashboard_filters, dashboard_widgets, dashboards, "
                "analyses, projects, users CASCADE"
            )
        )


@pytest.fixture(autouse=True)
def reset_domain_tables(migrated_db: str):
    """Zera as tabelas de domínio antes e depois de cada teste (banco de teste)."""
    truncate_domain()
    yield
    truncate_domain()


def payload(**overrides) -> dict:
    data = {
        "name": "Arboviroses",
        "description": "Dengue, chikungunya e zika",
    }
    data.update(overrides)
    return data


async def create_project(client, headers, **overrides) -> dict:
    response = await client.post(
        "/api/projects", json=payload(**overrides), headers=headers
    )
    assert response.status_code == 201
    return response.json()


async def test_create_project_returns_201_camel_case(client, auth_headers):
    response = await client.post(
        "/api/projects", json=payload(), headers=auth_headers
    )
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == "Arboviroses"
    assert data["description"] == "Dengue, chikungunya e zika"
    assert data["analysisCount"] == 0
    assert data["chartCount"] == 0
    assert data["dashboardCount"] == 0
    assert data["createdBy"] is None
    assert "created_at" not in data
    uuid.UUID(data["id"])
    assert data["createdAt"]
    assert data["updatedAt"]


async def test_create_project_without_auth_is_422(client):
    response = await client.post("/api/projects", json=payload())
    assert response.status_code == 422


async def test_create_project_with_invalid_token_is_401(client):
    response = await client.post(
        "/api/projects",
        json=payload(),
        headers={"Authorization": "Bearer token-invalido"},
    )
    assert response.status_code == 401


async def test_create_project_validates_empty_name(client, auth_headers):
    response = await client.post(
        "/api/projects", json=payload(name=""), headers=auth_headers
    )
    assert response.status_code == 422


async def test_created_by_is_resolved_from_token_sub(client):
    db = SessionLocal()
    user = User(username="lucas", full_name="Lucas Admin")
    db.add(user)
    db.commit()
    user_id = user.id
    db.close()

    headers = {"Authorization": f"Bearer {make_token(sub='lucas')}"}
    response = await client.post("/api/projects", json=payload(), headers=headers)
    assert response.status_code == 201
    assert response.json()["createdBy"] == str(user_id)


async def test_list_projects_returns_plain_array(client, auth_headers):
    first = await create_project(client, auth_headers, name="Projeto A")
    second = await create_project(client, auth_headers, name="Projeto B")

    response = await client.get("/api/projects", headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    ids = {item["id"] for item in data}
    assert first["id"] in ids
    assert second["id"] in ids


async def test_get_project_returns_detail(client, auth_headers):
    created = await create_project(client, auth_headers)

    response = await client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == created["id"]
    assert data["name"] == "Arboviroses"
    assert data["analysisCount"] == 0


async def test_get_project_with_unknown_id_is_404(client, auth_headers):
    response = await client.get(
        f"/api/projects/{uuid.uuid4()}", headers=auth_headers
    )
    assert response.status_code == 404


async def test_update_project_renames_partially(client, auth_headers):
    created = await create_project(client, auth_headers)

    response = await client.put(
        f"/api/projects/{created['id']}",
        json={"name": "Custos da Saúde"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    data = response.json()
    assert data["name"] == "Custos da Saúde"
    # PUT parcial: descrição ausente no payload é preservada
    assert data["description"] == created["description"]


async def test_update_project_with_unknown_id_is_404(client, auth_headers):
    response = await client.put(
        f"/api/projects/{uuid.uuid4()}",
        json={"name": "Qualquer"},
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_delete_project_returns_204(client, auth_headers):
    created = await create_project(client, auth_headers)

    response = await client.delete(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert response.status_code == 204

    gone = await client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert gone.status_code == 404


async def test_delete_project_keeps_resources_with_null_project(
    client, auth_headers
):
    created = await create_project(client, auth_headers)
    project_id = uuid.UUID(created["id"])

    db = SessionLocal()
    analysis = Analysis(
        name="Análise no projeto", sql="SELECT 1", project_id=project_id
    )
    dashboard = Dashboard(
        name="Painel no projeto",
        slug=f"painel-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
    )
    db.add_all([analysis, dashboard])
    db.commit()
    analysis_id = analysis.id
    dashboard_id = dashboard.id
    db.close()

    deleted = await client.delete(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert deleted.status_code == 204

    gone = await client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert gone.status_code == 404

    check = SessionLocal()
    analysis_row = check.scalar(
        select(Analysis).where(Analysis.id == analysis_id)
    )
    dashboard_row = check.scalar(
        select(Dashboard).where(Dashboard.id == dashboard_id)
    )
    check.close()

    assert analysis_row is not None
    assert analysis_row.project_id is None
    assert dashboard_row is not None
    assert dashboard_row.project_id is None


async def test_project_counts_analyses_charts_and_dashboards(
    client, auth_headers
):
    created = await create_project(client, auth_headers)
    project_id = uuid.UUID(created["id"])

    db = SessionLocal()
    db.add_all(
        [
            Analysis(
                name="Tabela 1",
                sql="SELECT 1",
                chart_type="table",
                project_id=project_id,
            ),
            Analysis(
                name="Tabela 2",
                sql="SELECT 2",
                chart_type="table",
                project_id=project_id,
            ),
            Analysis(
                name="Gráfico de barras",
                sql="SELECT 3",
                chart_type="bar",
                project_id=project_id,
            ),
            Analysis(
                name="Gráfico sem chart_type",
                sql="SELECT 4",
                project_id=project_id,
            ),
            # Fora do projeto: não deve contar
            Analysis(name="Análise solta", sql="SELECT 5", chart_type="table"),
            Dashboard(
                name="Painel no projeto",
                slug=f"painel-{uuid.uuid4().hex[:8]}",
                project_id=project_id,
            ),
            Dashboard(name="Painel solto", slug=f"painel-{uuid.uuid4().hex[:8]}"),
        ]
    )
    db.commit()
    db.close()

    detail = await client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert detail.status_code == 200
    data = detail.json()
    assert data["analysisCount"] == 2
    assert data["chartCount"] == 2  # bar + NULL contam como gráfico
    assert data["dashboardCount"] == 1

    listing = await client.get("/api/projects", headers=auth_headers)
    assert listing.status_code == 200
    from_list = next(
        item for item in listing.json() if item["id"] == created["id"]
    )
    assert from_list["analysisCount"] == 2
    assert from_list["chartCount"] == 2
    assert from_list["dashboardCount"] == 1


async def test_updated_at_considers_resource_activity(client, auth_headers):
    created = await create_project(client, auth_headers)
    project_id = uuid.UUID(created["id"])

    db = SessionLocal()
    analysis = Analysis(
        name="Tabela futura",
        sql="SELECT 1",
        chart_type="table",
        project_id=project_id,
    )
    db.add(analysis)
    db.commit()
    analysis_id = analysis.id
    db.execute(
        text(
            "UPDATE analyses SET updated_at = '2030-01-01T00:00:00Z' "
            "WHERE id = :id"
        ),
        {"id": analysis_id},
    )
    db.commit()
    db.close()

    detail = await client.get(
        f"/api/projects/{created['id']}", headers=auth_headers
    )
    assert detail.status_code == 200
    assert detail.json()["updatedAt"].startswith("2030-01-01")
