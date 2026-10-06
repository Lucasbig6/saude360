from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.session import engine


@pytest.fixture(autouse=True)
def reset_project_sources(migrated_db: str):
    """Garante o schema atual e limpa as ligações do teste."""
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE project_sources CASCADE"))
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE project_sources CASCADE"))


async def _create_project(client, headers, name="Projeto Fontes") -> str:
    response = await client.post(
        "/api/projects", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_list_sources(client, mock_superset_client, auth_headers):
    mock_superset_client.get.return_value = {
        "count": 1,
        "result": [{"id": 1, "database_name": "SESAPI Produção"}],
    }
    response = await client.get("/api/sources", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.asyncio
async def test_list_sources_unauthorized(client):
    response = await client.get("/api/sources")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_source(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {
        "id": 1,
        "database_name": "SESAPI Produção",
    }
    response = await client.post(
        "/api/sources",
        json={
            "database_name": "SESAPI Produção",
            "host": "localhost",
            "port": 5432,
            "database": "sesapi",
            "username": "admin",
            "password": "secret",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_test_connection_success(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"message": "OK"}
    response = await client.post(
        "/api/sources/test",
        json={
            "host": "localhost",
            "port": 5432,
            "database": "sesapi",
            "username": "admin",
            "password": "secret",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True


@pytest.mark.asyncio
async def test_test_connection_failure(client, mock_superset_client, auth_headers):
    mock_superset_client.post.side_effect = Exception("Connection refused")
    response = await client.post(
        "/api/sources/test",
        json={
            "host": "invalid-host",
            "port": 5432,
            "database": "sesapi",
            "username": "admin",
            "password": "secret",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False


@pytest.mark.asyncio
async def test_get_source_unwraps_result(client, mock_superset_client, auth_headers):
    mock_superset_client.get.return_value = {
        "result": {
            "id": 1,
            "database_name": "SESAPI Produção",
            "engine": "postgresql",
            "sqlalchemy_uri": "postgresql://admin:secret@localhost:5432/sesapi",
        }
    }
    response = await client.get("/api/sources/1", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["database_name"] == "SESAPI Produção"
    assert "sqlalchemy_uri" not in body


@pytest.mark.asyncio
async def test_get_source_not_found(client, mock_superset_client, auth_headers):
    mock_superset_client.get.side_effect = Exception("Not found")
    response = await client.get("/api/sources/999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_source(client, mock_superset_client, auth_headers):
    mock_superset_client.put.return_value = {"id": 1, "database_name": "Updated"}
    response = await client.put(
        "/api/sources/1",
        json={"database_name": "Updated"},
        headers=auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_delete_source(client, mock_superset_client, auth_headers):
    response = await client.delete("/api/sources/1", headers=auth_headers)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_get_source_datasets_filters_by_database_id(
    client, mock_superset_client, auth_headers
):
    """Superset não permite filtrar por database_id; backend filtra em Python."""
    mock_superset_client.get.return_value = {
        "count": 3,
        "result": [
            {
                "id": 1,
                "table_name": "atendimentos",
                "database": {"id": 1, "database_name": "SESAPI"},
            },
            {
                "id": 2,
                "table_name": "internacoes",
                "database": {"id": 2, "database_name": "Outra"},
            },
            {
                "id": 3,
                "table_name": "ambulatorial",
                "database": {"id": 1, "database_name": "SESAPI"},
            },
        ],
    }
    response = await client.get("/api/sources/1/datasets", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    names = {ds["table_name"] for ds in body["result"]}
    assert names == {"atendimentos", "ambulatorial"}


# ---------------------------------------------------------------------------
# Escopo de projeto (índice local project_sources)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sources_filters_by_project(client, mock_superset_client, auth_headers):
    project_id = await _create_project(client, auth_headers)
    mock_superset_client.get.return_value = {
        "count": 2,
        "result": [
            {"id": 1, "database_name": "SESAPI"},
            {"id": 2, "database_name": "Outra"},
        ],
    }
    link = await client.post(
        "/api/sources/1/projects", json={"projectId": project_id}, headers=auth_headers
    )
    assert link.status_code == 201

    response = await client.get(
        f"/api/sources?projectId={project_id}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert [item["id"] for item in body["result"]] == [1]


@pytest.mark.asyncio
async def test_list_sources_without_project_returns_all(
    client, mock_superset_client, auth_headers
):
    project_id = await _create_project(client, auth_headers)
    mock_superset_client.get.return_value = {
        "count": 2,
        "result": [
            {"id": 1, "database_name": "SESAPI"},
            {"id": 2, "database_name": "Outra"},
        ],
    }
    await client.post(
        "/api/sources/1/projects", json={"projectId": project_id}, headers=auth_headers
    )

    response = await client.get("/api/sources", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["count"] == 2


@pytest.mark.asyncio
async def test_create_source_with_project_links_it(
    client, mock_superset_client, auth_headers
):
    project_id = await _create_project(client, auth_headers)
    mock_superset_client.post.return_value = {"id": 42, "database_name": "Nova"}

    response = await client.post(
        "/api/sources",
        json={
            "database_name": "Nova",
            "host": "localhost",
            "port": 5432,
            "database": "nova",
            "username": "admin",
            "password": "secret",
            "projectId": project_id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201

    projects = await client.get("/api/sources/42/projects", headers=auth_headers)
    assert projects.status_code == 200
    assert [item["id"] for item in projects.json()] == [project_id]

    # O payload enviado ao Superset é montado só com campos conhecidos.
    sent = mock_superset_client.post.call_args.kwargs["json"]
    assert set(sent) == {
        "database_name",
        "sqlalchemy_uri",
        "expose_in_sqllab",
        "allow_ctas",
        "allow_cvas",
        "allow_dml",
        "allow_run_async",
    }


@pytest.mark.asyncio
async def test_create_source_with_unknown_project_is_404(
    client, mock_superset_client, auth_headers
):
    response = await client.post(
        "/api/sources",
        json={
            "database_name": "Nova",
            "host": "localhost",
            "port": 5432,
            "database": "nova",
            "username": "admin",
            "password": "secret",
            "projectId": "00000000-0000-0000-0000-000000000000",
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_link_and_unlink_source_project(client, auth_headers):
    project_id = await _create_project(client, auth_headers)

    link = await client.post(
        "/api/sources/7/projects", json={"projectId": project_id}, headers=auth_headers
    )
    assert link.status_code == 201

    listed = await client.get("/api/sources/7/projects", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["name"] == "Projeto Fontes"

    unlink = await client.delete(
        f"/api/sources/7/projects/{project_id}", headers=auth_headers
    )
    assert unlink.status_code == 204

    listed = await client.get("/api/sources/7/projects", headers=auth_headers)
    assert listed.json() == []

    again = await client.delete(
        f"/api/sources/7/projects/{project_id}", headers=auth_headers
    )
    assert again.status_code == 404
