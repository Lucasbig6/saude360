from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal, engine
from app.models import User
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
        "name": "Atendimentos por município",
        "description": "Comparativo mensal",
        "sql": "SELECT * FROM atendimentos",
        "databaseId": 1,
        "dbSchema": "public",
        "datasetId": 12,
        "chartType": "bar",
        "dimension": "municipio",
        "metric": "count",
    }
    data.update(overrides)
    return data


async def test_create_analysis_returns_201_camel_case(client, auth_headers):
    response = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == "Atendimentos por município"
    assert data["databaseId"] == 1
    assert data["dbSchema"] == "public"
    assert data["chartType"] == "bar"
    assert data["createdBy"] is None
    assert "created_at" not in data
    uuid.UUID(data["id"])
    assert data["createdAt"]
    assert data["updatedAt"]


async def test_create_analysis_without_auth_is_422(client):
    response = await client.post("/api/analyses", json=payload())
    assert response.status_code == 422


async def test_create_analysis_with_invalid_token_is_401(client):
    response = await client.post(
        "/api/analyses",
        json=payload(),
        headers={"Authorization": "Bearer token-invalido"},
    )
    assert response.status_code == 401


async def test_create_analysis_validates_empty_name(client, auth_headers):
    response = await client.post(
        "/api/analyses", json=payload(name=""), headers=auth_headers
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
    response = await client.post("/api/analyses", json=payload(), headers=headers)
    assert response.status_code == 201
    assert response.json()["createdBy"] == str(user_id)


async def test_list_analyses_returns_plain_array(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    assert created.status_code == 201

    response = await client.get("/api/analyses", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert [item["id"] for item in data] == [created.json()["id"]]


async def test_list_analyses_requires_auth(client):
    response = await client.get("/api/analyses")
    assert response.status_code == 422


async def test_get_analysis_by_id(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    analysis_id = created.json()["id"]

    response = await client.get(f"/api/analyses/{analysis_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == analysis_id


async def test_get_analysis_not_found_is_404(client, auth_headers):
    response = await client.get(f"/api/analyses/{uuid.uuid4()}", headers=auth_headers)
    assert response.status_code == 404


async def test_get_analysis_invalid_uuid_is_422(client, auth_headers):
    response = await client.get("/api/analyses/nao-uuid", headers=auth_headers)
    assert response.status_code == 422


async def test_put_updates_only_sent_fields(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    analysis_id = created.json()["id"]

    response = await client.put(
        f"/api/analyses/{analysis_id}",
        json={"name": "Renomeada"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Renomeada"
    assert data["description"] == "Comparativo mensal"
    assert data["sql"] == "SELECT * FROM atendimentos"
    assert data["metric"] == "count"


async def test_put_can_clear_description_with_null(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    analysis_id = created.json()["id"]

    response = await client.put(
        f"/api/analyses/{analysis_id}",
        json={"description": None},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["description"] is None


CHART_CONFIG = {
    "type": "bar",
    "encoding": {"x": "municipio", "y": "count", "color": "regiao"},
    "title": "Atendimentos por município",
    "xAxisLabel": "Município",
    "yAxisLabel": "Atendimentos",
    "numberFormat": "compact",
    "showValues": True,
    "legendPosition": "right",
    "colors": ["#0f766e", "#14b8a6"],
    "stacked": True,
    "sort": {"field": "count", "direction": "desc"},
    "limit": 20,
    "exportable": True,
}


async def test_create_and_get_persists_chart_config(client, auth_headers):
    created = await client.post(
        "/api/analyses",
        json=payload(chartConfig=CHART_CONFIG),
        headers=auth_headers,
    )
    assert created.status_code == 201
    assert created.json()["chartConfig"] == CHART_CONFIG

    fetched = await client.get(
        f"/api/analyses/{created.json()['id']}", headers=auth_headers
    )
    assert fetched.status_code == 200
    assert fetched.json()["chartConfig"] == CHART_CONFIG


async def test_put_updates_chart_config_and_clears_with_null(client, auth_headers):
    created = await client.post(
        "/api/analyses",
        json=payload(chartConfig=CHART_CONFIG),
        headers=auth_headers,
    )
    analysis_id = created.json()["id"]

    updated = {"title": "Novo título", "showValues": False}
    response = await client.put(
        f"/api/analyses/{analysis_id}",
        json={"chartConfig": {**CHART_CONFIG, **updated}},
        headers=auth_headers,
    )
    assert response.status_code == 200
    chart_config = response.json()["chartConfig"]
    assert chart_config["title"] == "Novo título"
    assert chart_config["showValues"] is False
    assert chart_config["colors"] == ["#0f766e", "#14b8a6"]

    cleared = await client.put(
        f"/api/analyses/{analysis_id}",
        json={"chartConfig": None},
        headers=auth_headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["chartConfig"] is None


async def test_put_analysis_not_found_is_404(client, auth_headers):
    response = await client.put(
        f"/api/analyses/{uuid.uuid4()}",
        json={"name": "Qualquer"},
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_delete_analysis_then_get_is_404(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    analysis_id = created.json()["id"]

    response = await client.delete(f"/api/analyses/{analysis_id}", headers=auth_headers)
    assert response.status_code == 204

    response = await client.get(f"/api/analyses/{analysis_id}", headers=auth_headers)
    assert response.status_code == 404


async def create_project(client, headers, name: str = "Projeto Beta") -> str:
    response = await client.post(
        "/api/projects", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()["id"]


async def test_create_analysis_with_project_returns_project_id(client, auth_headers):
    project_id = await create_project(client, auth_headers)

    response = await client.post(
        "/api/analyses", json=payload(projectId=project_id), headers=auth_headers
    )
    assert response.status_code == 201
    assert response.json()["projectId"] == project_id


async def test_create_analysis_without_project_has_null_project_id(
    client, auth_headers
):
    response = await client.post("/api/analyses", json=payload(), headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["projectId"] is None


async def test_create_analysis_with_unknown_project_is_400(client, auth_headers):
    response = await client.post(
        "/api/analyses",
        json=payload(projectId=str(uuid.uuid4())),
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Projeto não encontrado"


async def test_put_associates_analysis_with_project(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)

    response = await client.put(
        f"/api/analyses/{created.json()['id']}",
        json={"projectId": project_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["projectId"] == project_id


async def test_put_clears_analysis_project_with_null(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post(
        "/api/analyses", json=payload(projectId=project_id), headers=auth_headers
    )

    response = await client.put(
        f"/api/analyses/{created.json()['id']}",
        json={"projectId": None},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["projectId"] is None


async def test_put_without_project_id_preserves_link(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post(
        "/api/analyses", json=payload(projectId=project_id), headers=auth_headers
    )

    response = await client.put(
        f"/api/analyses/{created.json()['id']}",
        json={"name": "Renomeada"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Renomeada"
    assert data["projectId"] == project_id


async def test_put_analysis_with_unknown_project_is_400(client, auth_headers):
    created = await client.post("/api/analyses", json=payload(), headers=auth_headers)

    response = await client.put(
        f"/api/analyses/{created.json()['id']}",
        json={"projectId": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Projeto não encontrado"

    unchanged = await client.get(
        f"/api/analyses/{created.json()['id']}", headers=auth_headers
    )
    assert unchanged.json()["projectId"] is None


async def test_list_analyses_filters_by_project(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    await client.post(
        "/api/analyses",
        json=payload(name="Dentro do projeto", projectId=project_id),
        headers=auth_headers,
    )
    await client.post(
        "/api/analyses", json=payload(name="Sem projeto"), headers=auth_headers
    )

    filtered = await client.get(
        f"/api/analyses?projectId={project_id}", headers=auth_headers
    )
    assert filtered.status_code == 200
    items = filtered.json()
    assert len(items) == 1
    assert items[0]["name"] == "Dentro do projeto"
    assert items[0]["projectId"] == project_id

    # sem filtro -> comportamento legado: tudo
    legacy = await client.get("/api/analyses", headers=auth_headers)
    assert legacy.status_code == 200
    assert len(legacy.json()) == 2


async def test_list_analyses_filter_unknown_project_returns_empty(
    client, auth_headers
):
    await client.post("/api/analyses", json=payload(), headers=auth_headers)

    response = await client.get(
        f"/api/analyses?projectId={uuid.uuid4()}", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []
