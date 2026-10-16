from __future__ import annotations

import json

import pytest


@pytest.mark.asyncio
async def test_list_datasets(client, mock_superset_client, auth_headers):
    mock_superset_client.get.return_value = {
        "count": 1,
        "result": [{"id": 1, "table_name": "Test Dataset"}],
    }
    response = await client.get("/api/datasets", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.asyncio
async def test_list_datasets_unauthorized(client):
    response = await client.get("/api/datasets")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_dataset_unwraps_result(client, mock_superset_client, auth_headers):
    """Superset retorna {'result': {...}}; backend deve retornar o objeto interno."""
    mock_superset_client.get.return_value = {
        "result": {
            "id": 1,
            "table_name": "demo_atendimentos",
            "database": {"id": 1, "database_name": "main"},
            "schema": "public",
            "columns": [
                {
                    "column_name": "municipio",
                    "type": "VARCHAR",
                    "is_dttm": False,
                    "filterable": True,
                    "groupby": True,
                }
            ],
        }
    }
    response = await client.get("/api/datasets/1", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["table_name"] == "demo_atendimentos"
    assert "result" not in body
    assert len(body["columns"]) == 1
    assert body["columns"][0]["filterable"] is True


@pytest.mark.asyncio
async def test_get_dataset_no_result_key_returns_404(
    client, mock_superset_client, auth_headers
):
    """Quando Superset retorna sem 'result', backend deve retornar 404."""
    mock_superset_client.get.return_value = {"id": 1, "table_name": "Dataset"}
    response = await client.get("/api/datasets/1", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_dataset_not_found(client, mock_superset_client, auth_headers):
    mock_superset_client.get.side_effect = Exception("Not found")
    response = await client.get("/api/datasets/999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_dataset_columns_unwraps_result(
    client, mock_superset_client, auth_headers
):
    """Superset retorna {'result': {...}}; backend deve retornar o objeto interno."""
    mock_superset_client.get.return_value = {
        "result": {
            "id": 1,
            "table_name": "demo_atendimentos",
            "columns": [
                {"column_name": "id", "type": "INTEGER"},
                {"column_name": "municipio", "type": "VARCHAR"},
            ],
        }
    }
    response = await client.get("/api/datasets/1/columns", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert "result" not in body
    assert len(body["columns"]) == 2


@pytest.mark.asyncio
async def test_get_dataset_columns_no_result_key_returns_404(
    client, mock_superset_client, auth_headers
):
    """Quando Superset retorna sem 'result', backend deve retornar 404."""
    mock_superset_client.get.return_value = {
        "columns": [{"column_name": "id", "type": "INTEGER"}]
    }
    response = await client.get("/api/datasets/1/columns", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_distinct_values(client, mock_superset_client, auth_headers):
    mock_superset_client.get.return_value = {"distinct_columns": ["value1", "value2"]}
    response = await client.get(
        "/api/datasets/1/distinct/status", headers=auth_headers
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_refresh_columns(client, mock_superset_client, auth_headers):
    mock_superset_client.put.return_value = {"result": "success"}
    response = await client.put("/api/datasets/1/refresh", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_dataset_updates_display_name_on_existing_dataset(
    client, mock_superset_client
):
    from app.superset.datasets import create_dataset

    mock_superset_client.get.return_value = {
        "result": [
            {
                "id": 42,
                "table_name": "monisus_ds_ranking_123abc",
                "database": {"id": 4},
                "extra": "{}",
            }
        ]
    }

    result = await create_dataset(
        database_id=4,
        table_name="monisus_ds_ranking_123abc",
        description="Indicadores municipais",
        display_name="Ranking de municípios",
    )

    assert result["id"] == 42
    mock_superset_client.post.assert_not_awaited()
    mock_superset_client.put.assert_awaited_once_with(
        "/api/v1/dataset/42",
        json={
            "description": "Indicadores municipais",
            "extra": json.dumps(
                {"monisus_display_name": "Ranking de municípios"},
                ensure_ascii=False,
            ),
        },
    )


# --- Publish Dataset tests ---


@pytest.mark.asyncio
async def test_publish_dataset_success(client, mock_superset_client, auth_headers):
    call_count = 0

    async def side_effect(path, **kwargs):
        nonlocal call_count
        call_count += 1
        if "sqllab/execute" in path:
            return {"status": "success"}
        if path == "/api/v1/dataset/":
            return {"data": {"id": 42, "table_name": "monisus_ds_teste_a1b2c3"}}
        return {}

    mock_superset_client.post.side_effect = side_effect

    response = await client.post(
        "/api/datasets/publish",
        json={
            "database_id": 4,
            "sql": "SELECT municipio FROM demo_atendimentos",
            "db_schema": "public",
            "name": "Ranking de municípios",
            "description": "Descricao",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == 42
    assert body["table_name"].startswith("monisus_ds_ranking_de_municipios_")
    assert body["schema"] == "public"
    assert body["name"] == "Ranking de municípios"
    assert body["description"] == "Descricao"
    assert body["database_id"] == 4
    assert call_count == 2
    mock_superset_client.put.assert_awaited_once_with(
        "/api/v1/dataset/42",
        json={
            "description": "Descricao",
            "extra": json.dumps(
                {"monisus_display_name": "Ranking de municípios"},
                ensure_ascii=False,
            ),
        },
    )


@pytest.mark.asyncio
async def test_publish_dataset_insert_bloqueado(client, mock_superset_client, auth_headers):
    response = await client.post(
        "/api/datasets/publish",
        json={
            "database_id": 4,
            "sql": "INSERT INTO table VALUES (1)",
            "name": "Teste",
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
    mock_superset_client.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_dataset_empty_name(client, mock_superset_client, auth_headers):
    response = await client.post(
        "/api/datasets/publish",
        json={
            "database_id": 4,
            "sql": "SELECT 1",
            "name": "   ",
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_publish_dataset_ctas_blocked(client, mock_superset_client, auth_headers):
    from httpx import HTTPStatusError, Request, Response

    async def side_effect(path, **kwargs):
        if "sqllab/execute" in path:
            req = Request("POST", "http://test/api/v1/sqllab/execute/")
            resp = Response(
                status_code=403,
                request=req,
                json={
                    "errors": [
                        {
                            "message": (
                                "This database does not allow creating "
                                "tables from queries (CTAS)."
                            )
                        }
                    ]
                },
            )
            raise HTTPStatusError(message="403", request=req, response=resp)
        return {}

    mock_superset_client.post.side_effect = side_effect

    response = await client.post(
        "/api/datasets/publish",
        json={
            "database_id": 6,
            "sql": "SELECT 1",
            "name": "Teste",
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "materialização" in detail.lower() or "CTAS" in detail
