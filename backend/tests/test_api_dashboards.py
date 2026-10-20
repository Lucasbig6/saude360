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
                "TRUNCATE dashboard_filters, dashboard_widgets, dashboard_pages, "
                "dashboards, analyses, projects, users CASCADE"
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


async def create_chart_analysis(
    client,
    headers,
    *,
    chart_type: str | None = "line",
    dimension: str | None = "mes",
    metric: str | None = "total",
) -> str:
    response = await client.post(
        "/api/analyses",
        json={
            "name": "Análise com chart",
            "sql": "SELECT 1",
            "chartType": chart_type,
            "dimension": dimension,
            "metric": metric,
        },
        headers=headers,
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
                    "controlType": "multi-select",
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
        "controlType": "multi-select",
    }
    assert data["filters"][1]["datasetId"] is None
    assert data["filters"][1]["defaultValue"] == "2024-01-01"
    assert data["filters"][1]["scope"] is None
    assert data["filters"][1]["controlType"] == "dropdown"

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


async def test_put_updates_filter_and_widget_style_round_trip(client, auth_headers):
    """Etapas B/C: edição de filtro e camada persiste e recarrega intacta."""
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel editável",
            "widgets": [
                {
                    **widget(analysis_id),
                    "id": str(uuid.uuid4()),
                    "widget": {"type": "bar"},
                },
                {
                    "id": str(uuid.uuid4()),
                    "analysisId": None,
                    "layout": {"x": 0, "y": 4, "w": 4, "h": 2},
                    "widget": {
                        "type": "filter",
                        "filterId": "00000000-0000-0000-0000-000000000000",
                    },
                },
            ],
            "filters": [
                {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "datasetId": 3,
                    "column": "municipio",
                    "operator": "eq",
                    "defaultValue": "",
                    "scope": "dashboard",
                    "controlType": "dropdown",
                },
            ],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    dashboard_id = created.json()["id"]

    updated = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "widgets": [
                {
                    **widget(analysis_id),
                    "id": created.json()["widgets"][0]["id"],
                    "widget": {
                        "type": "bar",
                        "style": {"zIndex": 5, "opacity": 0.9, "visible": True},
                    },
                },
                {
                    "id": created.json()["widgets"][1]["id"],
                    "analysisId": None,
                    "layout": {"x": 0, "y": 4, "w": 4, "h": 2},
                    "widget": {
                        "type": "filter",
                        "filterId": "00000000-0000-0000-0000-000000000000",
                    },
                },
            ],
            "filters": [
                {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "datasetId": 3,
                    "column": "municipio",
                    "operator": "in",
                    "defaultValue": ["SP", "RJ"],
                    "scope": [analysis_id],
                    "controlType": "multi-select",
                },
            ],
        },
        headers=auth_headers,
    )
    assert updated.status_code == 200
    data = updated.json()
    assert data["widgets"][0]["widget"]["style"] == {
        "zIndex": 5,
        "opacity": 0.9,
        "visible": True,
    }
    assert data["filters"][0]["controlType"] == "multi-select"
    assert data["filters"][0]["defaultValue"] == ["SP", "RJ"]
    assert data["filters"][0]["scope"] == [analysis_id]

    reread = await client.get(f"/api/dashboards/{dashboard_id}", headers=auth_headers)
    assert reread.status_code == 200
    assert reread.json()["filters"][0]["controlType"] == "multi-select"
    assert reread.json()["widgets"][0]["widget"]["style"]["zIndex"] == 5


async def test_independent_text_widget_round_trips_without_analysis(client, auth_headers):
    widget_id = str(uuid.uuid4())
    create = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel com texto",
            "widgets": [
                {
                    "id": widget_id,
                    "layout": {"x": 2, "y": 1, "w": 4, "h": 2},
                    "widget": {
                        "type": "text",
                        "title": "Resumo",
                        "content": "Indicadores do período",
                    },
                }
            ],
        },
        headers=auth_headers,
    )

    assert create.status_code == 201
    created_widget = create.json()["widgets"][0]
    assert created_widget["id"] == widget_id
    assert created_widget["analysisId"] is None
    assert created_widget["widget"] == {
        "type": "text",
        "title": "Resumo",
        "content": "Indicadores do período",
    }

    reread = await client.get(
        f"/api/dashboards/{create.json()['id']}", headers=auth_headers
    )
    assert reread.status_code == 200
    assert reread.json()["widgets"] == [created_widget]


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


async def test_get_filter_distinct_is_public(client, auth_headers, mock_superset_client):
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel com filtro",
            "filters": [
                {
                    "datasetId": 3,
                    "column": "municipio",
                    "operator": "in",
                    "defaultValue": [],
                    "scope": "dashboard",
                    "controlType": "multi-select",
                }
            ],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    slug = created.json()["slug"]
    filter_id = created.json()["filters"][0]["id"]

    mock_superset_client.get.return_value = {"result": ["SP", "RJ", "MG"]}
    # sem headers de autenticação: o link compartilhado precisa abrir
    response = await client.get(
        f"/api/dashboards/by-slug/{slug}/filters/{filter_id}/distinct"
    )
    assert response.status_code == 200
    assert response.json() == {"result": ["SP", "RJ", "MG"]}
    mock_superset_client.get.assert_awaited_once()
    assert "/api/v1/dataset/distinct/municipio" in mock_superset_client.get.await_args.args[0]


async def test_get_filter_distinct_unknown_slug_or_filter_is_404(client, auth_headers):
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel filtro 404",
            "filters": [
                {"datasetId": 3, "column": "uf", "operator": "eq", "scope": "dashboard"}
            ],
        },
        headers=auth_headers,
    )
    slug = created.json()["slug"]
    filter_id = created.json()["filters"][0]["id"]

    unknown_slug = await client.get(
        f"/api/dashboards/by-slug/nao-existe/filters/{filter_id}/distinct"
    )
    assert unknown_slug.status_code == 404

    unknown_filter = await client.get(
        f"/api/dashboards/by-slug/{slug}/filters/{uuid.uuid4()}/distinct"
    )
    assert unknown_filter.status_code == 404


async def test_get_filter_distinct_without_dataset_returns_empty(
    client, auth_headers, mock_superset_client
):
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel filtro sem dataset",
            "filters": [{"column": "uf", "operator": "eq", "scope": "dashboard"}],
        },
        headers=auth_headers,
    )
    slug = created.json()["slug"]
    filter_id = created.json()["filters"][0]["id"]

    response = await client.get(
        f"/api/dashboards/by-slug/{slug}/filters/{filter_id}/distinct"
    )
    assert response.status_code == 200
    assert response.json() == {"result": []}
    mock_superset_client.get.assert_not_awaited()


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


# ---------------------------------------------------------------------------
# Widget v2 (config em JSONB)
# ---------------------------------------------------------------------------


async def test_create_widget_with_v2_config_round_trip(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    config = {
        "type": "bar",
        "encoding": {"x": "municipio", "y": "total"},
        "aggregation": {"field": "total", "function": "sum"},
        "sort": {"field": "total", "direction": "desc"},
        "limit": 5,
        "legend": False,
        "tooltip": True,
        "title": "Atendimentos",
        "options": {"barMaxWidth": 40},
    }

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel v2",
            "widgets": [{**widget(analysis_id), "widget": config}],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["widgets"][0]["widget"] == config

    reread = await client.get(
        f"/api/dashboards/{response.json()['id']}", headers=auth_headers
    )
    assert reread.json()["widgets"][0]["widget"] == config


async def test_widget_without_config_is_derived_from_analysis(client, auth_headers):
    analysis_id = await create_chart_analysis(
        client, auth_headers, chart_type="line", dimension="mes", metric="total"
    )

    response = await client.post(
        "/api/dashboards",
        json={"name": "Painel legado", "widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["widgets"][0]["widget"] == {
        "type": "line",
        "legend": True,
        "tooltip": True,
        "encoding": {"x": "mes", "y": "total"},
    }


async def test_widget_derivation_handles_table_and_unknown_chart_type(
    client, auth_headers
):
    table_id = await create_chart_analysis(
        client, auth_headers, chart_type="table", dimension=None, metric=None
    )
    unknown_id = await create_chart_analysis(
        client, auth_headers, chart_type="boxplot", dimension=None, metric=None
    )
    plain_id = await create_analysis(client, auth_headers, name="Sem chartType")

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Derivação",
            "widgets": [
                widget(table_id),
                widget(unknown_id),
                widget(plain_id),
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    widgets = response.json()["widgets"]
    assert widgets[0]["widget"] == {"type": "table"}
    assert widgets[1]["widget"] == {
        "type": "bar",
        "legend": True,
        "tooltip": True,
    }
    assert widgets[2]["widget"] == {
        "type": "bar",
        "legend": True,
        "tooltip": True,
    }


async def test_widget_with_unknown_type_is_422(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel inválido",
            "widgets": [
                {**widget(analysis_id), "widget": {"type": "sunburst"}},
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


async def test_widget_invalid_config_is_422(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)

    invalid_payloads = [
        {"type": "bar", "aggregation": {"field": "total", "function": "median"}},
        {"type": "bar", "limit": 0},
        {"type": "bar", "sort": {"field": "total", "direction": "up"}},
        {"type": "bar", "aggregation": {"field": "", "function": "sum"}},
    ]
    for payload in invalid_payloads:
        response = await client.post(
            "/api/dashboards",
            json={
                "name": "Painel inválido",
                "widgets": [{**widget(analysis_id), "widget": payload}],
            },
            headers=auth_headers,
        )
        assert response.status_code == 422, payload


async def test_widget_with_non_chart_type_keeps_extra_fields(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    config = {"type": "kpi", "field": "total", "aggregation": "sum"}

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel kpi",
            "widgets": [{**widget(analysis_id), "widget": config}],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["widgets"][0]["widget"] == config


async def test_put_updates_widget_config(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    first_config = {"type": "pie", "encoding": {"x": "municipio", "y": "total"}}
    second_config = {
        "type": "bar",
        "encoding": {"x": "municipio", "y": "total"},
        "limit": 10,
    }

    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel editável",
            "widgets": [{**widget(analysis_id), "widget": first_config}],
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    existing_id = created.json()["widgets"][0]["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "widgets": [
                {
                    "id": existing_id,
                    **widget(analysis_id),
                    "widget": second_config,
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["widgets"][0]["widget"] == second_config

    reread = await client.get(
        f"/api/dashboards/{dashboard_id}", headers=auth_headers
    )
    assert reread.json()["widgets"][0]["widget"] == second_config


async def test_put_without_widget_keeps_derived_config(client, auth_headers):
    analysis_id = await create_chart_analysis(
        client, auth_headers, chart_type="pie", dimension="municipio", metric="total"
    )
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel", "widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    expected = created.json()["widgets"][0]["widget"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "widgets": [
                {"id": created.json()["widgets"][0]["id"], **widget(analysis_id)}
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["widgets"][0]["widget"] == expected
    assert expected["type"] == "pie"


# ---------------------------------------------------------------------------
# Páginas do painel (barra inferior fixa)
# ---------------------------------------------------------------------------


def pages_payload(*names: str) -> list[dict]:
    """Páginas com id gerado no cliente (padrão da UI)."""
    return [{"id": str(uuid.uuid4()), "name": name} for name in names]


async def test_create_with_pages_and_widgets_round_trip(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    page_a, page_b = str(uuid.uuid4()), str(uuid.uuid4())
    widget_a, widget_b = str(uuid.uuid4()), str(uuid.uuid4())

    response = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel multi",
            "pages": [
                {"id": page_a, "name": "Resumo"},
                {"id": page_b, "name": "Detalhe"},
            ],
            "activePageId": page_b,
            "widgets": [
                {**widget(analysis_id), "id": widget_a, "pageId": page_a},
                {**widget(analysis_id, x=6), "id": widget_b, "pageId": page_b},
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()

    assert [(p["id"], p["name"], p["position"]) for p in data["pages"]] == [
        (page_a, "Resumo", 0),
        (page_b, "Detalhe", 1),
    ]
    assert data["activePageId"] == page_b
    page_by_widget = {w["id"]: w["pageId"] for w in data["widgets"]}
    assert page_by_widget == {widget_a: page_a, widget_b: page_b}

    # persistência real: relê do banco (nova sessão)
    reread = await client.get(f"/api/dashboards/{data['id']}", headers=auth_headers)
    assert reread.status_code == 200
    body = reread.json()
    assert [p["id"] for p in body["pages"]] == [page_a, page_b]
    assert body["activePageId"] == page_b
    assert {w["id"]: w["pageId"] for w in body["widgets"]} == {
        widget_a: page_a,
        widget_b: page_b,
    }


async def test_create_without_pages_keeps_legacy_contract(client, auth_headers):
    """Dashboard antigo (sem páginas): pages [], pageId null — o frontend
    sintetiza a 'Página 1' sem nenhum dado fictício no banco."""
    analysis_id = await create_analysis(client, auth_headers)

    response = await client.post(
        "/api/dashboards",
        json={"name": "Painel legado", "widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["pages"] == []
    assert data["activePageId"] is None
    assert data["widgets"][0]["pageId"] is None

    public = await client.get(f"/api/dashboards/by-slug/{data['slug']}")
    assert public.status_code == 200
    assert public.json()["pages"] == []
    assert public.json()["widgets"][0]["pageId"] is None


async def test_put_renames_reorders_and_deletes_pages(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    page_a, page_b = str(uuid.uuid4()), str(uuid.uuid4())
    widget_a, widget_b = str(uuid.uuid4()), str(uuid.uuid4())

    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel editável",
            "pages": [
                {"id": page_a, "name": "Resumo"},
                {"id": page_b, "name": "Detalhe"},
            ],
            "activePageId": page_a,
            "widgets": [
                {**widget(analysis_id), "id": widget_a, "pageId": page_a},
                {**widget(analysis_id, x=6), "id": widget_b, "pageId": page_b},
            ],
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    page_c = str(uuid.uuid4())

    # renomeia A, inverte a ordem (B antes de A), cria C e exclui B.
    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "pages": [
                {"id": page_b, "name": "Detalhe"},
                {"id": page_a, "name": "Resumo renomeada"},
                {"id": page_c, "name": "Anexos"},
            ],
            "activePageId": page_a,
            "widgets": [
                {**widget(analysis_id), "id": widget_a, "pageId": page_a},
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()

    assert [(p["id"], p["name"], p["position"]) for p in data["pages"]] == [
        (page_b, "Detalhe", 0),
        (page_a, "Resumo renomeada", 1),
        (page_c, "Anexos", 2),
    ]
    assert data["activePageId"] == page_a
    # widget de B excluído junto com a página; widget de A preservado.
    assert [w["id"] for w in data["widgets"]] == [widget_a]

    reread = await client.get(f"/api/dashboards/{dashboard_id}", headers=auth_headers)
    body = reread.json()
    assert [p["id"] for p in body["pages"]] == [page_b, page_a, page_c]
    assert [w["id"] for w in body["widgets"]] == [widget_a]


async def test_put_active_page_coerced_when_invalid(client, auth_headers):
    page_a, page_b = str(uuid.uuid4()), str(uuid.uuid4())
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel",
            "pages": [{"id": page_a, "name": "A"}, {"id": page_b, "name": "B"}],
            "activePageId": page_b,
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    assert created.json()["activePageId"] == page_b

    # id inexistente -> coerção para a primeira página (nunca 500).
    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"activePageId": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["activePageId"] == page_a

    # volta para B; páginas não enviadas permanecem intactas.
    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"activePageId": page_b},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["activePageId"] == page_b
    assert [p["id"] for p in data["pages"]] == [page_a, page_b]


async def test_put_keeps_widget_page_when_page_id_omitted(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    page_a = str(uuid.uuid4())
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel",
            "pages": [{"id": page_a, "name": "A"}],
            "widgets": [{**widget(analysis_id), "pageId": page_a}],
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]
    widget_id = created.json()["widgets"][0]["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"widgets": [{"id": widget_id, **widget(analysis_id)}]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["widgets"][0]["pageId"] == page_a


async def test_put_new_widget_without_page_lands_on_active_page(
    client, auth_headers
):
    analysis_id = await create_analysis(client, auth_headers)
    page_a, page_b = str(uuid.uuid4()), str(uuid.uuid4())
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Painel",
            "pages": [{"id": page_a, "name": "A"}, {"id": page_b, "name": "B"}],
            "activePageId": page_b,
        },
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["widgets"][0]["pageId"] == page_b


async def test_put_widget_with_unknown_page_is_400(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    created = await client.post(
        "/api/dashboards",
        json={"name": "Painel", "widgets": [widget(analysis_id)]},
        headers=auth_headers,
    )
    dashboard_id = created.json()["id"]

    response = await client.put(
        f"/api/dashboards/{dashboard_id}",
        json={
            "widgets": [
                {**widget(analysis_id), "pageId": str(uuid.uuid4())}
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_by_slug_returns_pages_for_shared_viewer(client, auth_headers):
    analysis_id = await create_analysis(client, auth_headers)
    page_a, page_b = str(uuid.uuid4()), str(uuid.uuid4())
    created = await client.post(
        "/api/dashboards",
        json={
            "name": "Compartilhado",
            "pages": [{"id": page_a, "name": "A"}, {"id": page_b, "name": "B"}],
            "activePageId": page_b,
            "widgets": [
                {**widget(analysis_id), "pageId": page_a},
                {**widget(analysis_id, x=6), "pageId": page_b},
            ],
        },
        headers=auth_headers,
    )
    slug = created.json()["slug"]

    public = await client.get(f"/api/dashboards/by-slug/{slug}")
    assert public.status_code == 200
    body = public.json()
    assert [(p["id"], p["name"]) for p in body["pages"]] == [
        (page_a, "A"),
        (page_b, "B"),
    ]
    assert body["activePageId"] == page_b
    assert [w["pageId"] for w in body["widgets"]] == [page_a, page_b]
    # dados das análises continuam embutidos para o viewer anônimo.
    assert body["widgets"][0]["analysisData"]["id"] == analysis_id
