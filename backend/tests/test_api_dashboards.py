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


async def create_analysis(client, headers, name: str = "Análise base") -> str:
    response = await client.post(
        "/api/analyses", json={"name": name, "sql": "SELECT 1"}, headers=headers
    )
    assert response.status_code == 201
    return response.json()["id"]


def widget(analysis_id: str, **layout) -> dict:
    return {
        "analysisId": analysis_id,
        "layout": {"x": 0, "y": 0, "w": 4, "h": 4, **layout},
    }


async def test_create_minimal_dashboard_generates_slug(client, auth_headers):
    response = await client.post(
        "/api/dashboards",
        json={"name": "Meu Painel"},
        headers=auth_headers,
    )
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == "Meu Painel"
    assert data["slug"] == "meu-painel"
    assert data["description"] is None
    assert data["appearance"] == {}
    assert data["widgets"] == []
    assert data["filters"] == []
    assert data["createdBy"] is None
    assert "created_at" not in data
    uuid.UUID(data["id"])


async def test_duplicated_name_gets_slug_suffix(client, auth_headers):
    first = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )
    second = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )
    assert first.json()["slug"] == "painel"
    assert second.json()["slug"] == "painel-2"


async def test_explicit_duplicate_slug_is_409(client, auth_headers):
    first = await client.post(
        "/api/dashboards",
        json={"name": "Um", "slug": "duplicado"},
        headers=auth_headers,
    )
    assert first.status_code == 201
    assert first.json()["slug"] == "duplicado"

    second = await client.post(
        "/api/dashboards",
        json={"name": "Dois", "slug": "duplicado"},
        headers=auth_headers,
    )
    assert second.status_code == 409


async def test_create_without_auth_is_422(client):
    response = await client.post("/api/dashboards", json={"name": "Painel"})
    assert response.status_code == 422


async def test_create_with_widgets_and_filters_round_trip(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel completo",
            "description": "com widgets",
            "appearance": {"theme": "dark", "showBrand": True},
            "widgets": [
                {**widget(analysis_id), "id": str(uuid.uuid4()), "layout": {
                    "x": 0, "y": 0, "w": 6, "h": 3,
                }},
                widget(analysis_id, x=6, y=0, w=6, h=4),
            ],
            "filters": [
                {
                    "datasetId": 3,
                    "column": "municipio",
                    "operator": "in",
                    "defaultValue": ["SP", "RJ"],
                    "scope": "dashboard",
                },
                {
                    "column": "periodo",
                    "operator": "gte",
                    "defaultValue": "2024-01-01",
                },
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()

    assert data["appearance"] == {"theme": "dark", "showBrand": True}
    assert len(data["widgets"]) == 2
    first_widget = data["widgets"][0]
    assert first_widget["analysisId"] == analysis_id
    assert first_widget["layout"] == {"x": 0, "y": 0, "w": 6, "h": 3}
    assert data["widgets"][1]["layout"] == {"x": 6, "y": 0, "w": 6, "h": 4}

    assert len(data["filters"]) == 2
    assert data["filters"][0] == {
        "id": data["filters"][0]["id"],
        "datasetId": 3,
        "column": "municipio",
        "operator": "in",
        "defaultValue": ["SP", "RJ"],
        "scope": "dashboard",
    }
    assert data["filters"][1]["datasetId"] is None
    assert data["filters"][1]["defaultValue"] == "2024-01-01"
    assert data["filters"][1]["scope"] is None

    # persistência real: relê do banco (nova sessão)
    reread = await client.get(
        f"/api/dashboards/{data['id']}", headers=auth_headers
    )
    assert reread.status_code == 200
    assert reread.json()["filters"][0]["defaultValue"] == ["SP", "RJ"]


async def test_widget_without_existing_analysis_is_400(client, auth_headers):
    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel inválido",
            "widgets": [widget(str(uuid.uuid4()))],
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_list_dashboards_returns_plain_array(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.get("/api/dashboards", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert [item["id"] for item in data] == [created.json()["id"]]


async def test_list_dashboards_requires_auth(client):
    response = await client.get("/api/dashboards")
    assert response.status_code == 422


async def test_get_dashboard_by_id(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )
    dashboard_id = created.json()["id"]

    response = await client.get(f"/api/dashboards/{dashboard_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == dashboard_id


async def test_get_dashboard_not_found_is_404(client, auth_headers):
    response = await client.get(
        f"/api/dashboards/{uuid.uuid4()}", headers=auth_headers
    )
    assert response.status_code == 404


async def test_get_by_slug_is_public(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel Público"}, headers=auth_headers
    )
    slug = created.json()["slug"]
    dashboard_id = created.json()["id"]

    public = await client.get(f"/api/dashboards/by-slug/{slug}")
    assert public.status_code == 200
    assert public.json()["id"] == dashboard_id

    insensitive = await client.get(f"/api/dashboards/by-slug/{slug.upper()}")
    assert insensitive.status_code == 200
    assert insensitive.json()["id"] == dashboard_id


async def test_get_by_unknown_slug_is_404(client):
    response = await client.get("/api/dashboards/by-slug/nao-existe")
    assert response.status_code == 404


async def test_put_full_update_preserves_widget_ids(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel editável",
            "widgets": [
                widget(analysis_id, x=0, y=0),
                widget(analysis_id, x=4, y=0),
            ],
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    [first, second] = created.json()["widgets"]
    new_widget_id = str(uuid.uuid4())

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "name": "Painel editado",
            "description": "agora com descrição",
            "widgets": [
                {"id": second["id"], **widget(analysis_id, x=0, y=4, w=8, h=2)},
                {"id": new_widget_id, **widget(analysis_id, x=8, y=4)},
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Painel editado"
    assert data["description"] == "agora com descrição"
    returned_ids = [w["id"] for w in data["widgets"]]
    assert len(returned_ids) == 2
    # IDs do cliente são preservados; a ordem da resposta é a de criação.
    assert set(returned_ids) == {second["id"], new_widget_id}
    assert first["id"] not in returned_ids
    assert returned_ids[0] == second["id"]

    kept = next(w for w in data["widgets"] if w["id"] == second["id"])
    assert kept["layout"] == {"x": 0, "y": 4, "w": 8, "h": 2}

    reread = await client.get(f"/api/dashboards/{dashboard_id}", headers=auth_headers)
    assert [w["id"] for w in reread.json()["widgets"]] == returned_ids


async def test_put_without_widgets_keeps_existing_ones(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel", "widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"description": "só descrição"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert len(response.json()["widgets"]) == 1
    assert response.json()["widgets"][0]["id"] == created.json()["widgets"][0]["id"]


async def test_put_with_empty_widgets_clears_them(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel",
            "widgets": [widget(analysis_id)],
            "filters": [
                {"column": "municipio", "operator": "eq", "defaultValue": "SP"}
            ],
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"widgets": [], "filters": []},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["widgets"] == []
    assert response.json()["filters"] == []


async def test_put_preserves_slug_when_not_sent(client, auth_headers):
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel fixo", "slug": "slug-original"},
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"name": "Outro nome"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["slug"] == "slug-original"


async def test_put_duplicate_slug_is_409(client, auth_headers):
    await client.post(
        "/api/dashboards", json={"name": "Um", "slug": "um"}, headers=auth_headers
    )
    other = await client.post(
        "/api/dashboards", json={"name": "Dois", "slug": "dois"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{other.json()['id']}",
        json={"slug": "um"},
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_put_its_own_slug_is_allowed(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel", "slug": "mesmo"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"slug": "MESMO"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["slug"] == "mesmo"


async def test_put_updates_appearance(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"appearance": {"theme": "dark"}},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["appearance"] == {"theme": "dark"}


async def test_delete_dashboard_then_get_is_404(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )
    dashboard_id = created.json()["id"]

    response = await client.delete(
        f"/api/dashboards/{dashboard_id}", headers=auth_headers
    )
    assert response.status_code == 204

    response = await client.get(
        f"/api/dashboards/{dashboard_id}", headers=auth_headers
    )
    assert response.status_code == 404


async def test_delete_cascades_widgets_and_filters(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel",
            "widgets": [widget(analysis_id)],
            "filters": [{"column": "municipio", "operator": "eq"}],
        },
        headers=auth_headers,
    )

    response = await client.delete(
        f"/api/dashboards/{created.json()['id']}", headers=auth_headers
    )
    assert response.status_code == 204

    remaining = await client.get("/api/dashboards", headers=auth_headers)
    assert remaining.json() == []


async def test_put_requires_auth(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}", json={"name": "Sem auth"}
    )
    assert response.status_code == 422


async def test_created_by_resolved_from_token(client):
    db = SessionLocal()
    user = User(username="lucas", full_name="Lucas Admin")
    db.add(user)
    db.commit()
    user_id = user.id
    db.close()

    headers = {"Authorization": f"Bearer {make_token(sub='lucas')}"}
    response = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=headers
    )
    assert response.status_code == 201
    assert response.json()["createdBy"] == str(user_id)


async def create_project(client, headers, name: str = "Projeto Beta") -> str:
    response = await client.post(
        "/api/projects", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()["id"]


async def test_create_dashboard_with_project_returns_project_id(
    client, auth_headers
):
    project_id = await create_project(client, auth_headers)

    response = await client.post(
        "/api/dashboards",
        json={"name": "Painel no projeto", "projectId": project_id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["projectId"] == project_id


async def test_create_dashboard_without_project_has_null_project_id(
    client, auth_headers
):
    response = await client.post(
        "/api/dashboards", json={"name": "Painel solto"}, headers=auth_headers
    )
    assert response.status_code == 201
    assert response.json()["projectId"] is None


async def test_create_dashboard_with_unknown_project_is_400(client, auth_headers):
    response = await client.post(
        "/api/dashboards",
        json={"name": "Painel inválido", "projectId": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Projeto não encontrado"


async def test_put_associates_dashboard_with_project(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"projectId": project_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["projectId"] == project_id


async def test_put_clears_dashboard_project_with_null(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel", "projectId": project_id},
        headers=auth_headers,
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"projectId": None},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["projectId"] is None


async def test_put_without_project_id_preserves_link(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel", "projectId": project_id},
        headers=auth_headers,
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"description": "só descrição"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "só descrição"
    assert data["projectId"] == project_id


async def test_put_dashboard_with_unknown_project_is_400(client, auth_headers):
    created = await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.put(
        f"/api/dashboards/{created.json()['id']}",
        json={"projectId": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Projeto não encontrado"

    unchanged = await client.get(
        f"/api/dashboards/{created.json()['id']}", headers=auth_headers
    )
    assert unchanged.json()["projectId"] is None


async def test_list_dashboards_filters_by_project(client, auth_headers):
    project_id = await create_project(client, auth_headers)
    await client.post(
        "/api/dashboards",
        json={"name": "Dentro do projeto", "projectId": project_id},
        headers=auth_headers,
    )
    await client.post(
        "/api/dashboards", json={"name": "Sem projeto"}, headers=auth_headers
    )

    filtered = await client.get(
        f"/api/dashboards?projectId={project_id}", headers=auth_headers
    )
    assert filtered.status_code == 200
    items = filtered.json()
    assert len(items) == 1
    assert items[0]["name"] == "Dentro do projeto"
    assert items[0]["projectId"] == project_id

    # sem filtro -> comportamento legado: tudo
    legacy = await client.get("/api/dashboards", headers=auth_headers)
    assert legacy.status_code == 200
    assert len(legacy.json()) == 2


async def test_list_dashboards_filter_unknown_project_returns_empty(
    client, auth_headers
):
    await client.post(
        "/api/dashboards", json={"name": "Painel"}, headers=auth_headers
    )

    response = await client.get(
        f"/api/dashboards?projectId={uuid.uuid4()}", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []
