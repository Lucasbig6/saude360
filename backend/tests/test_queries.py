from __future__ import annotations

import pytest


@ pytest.mark.asyncio
async def test_execute_query(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {
        "status": "success",
        "data": [{"col1": "value1"}],
    }
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


@ pytest.mark.asyncio
async def test_execute_query_unauthorized(client):
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1"},
    )
    assert response.status_code == 422


@ pytest.mark.asyncio
async def test_execute_query_with_schema(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT * FROM table", "db_schema": "public"},
        headers=auth_headers,
    )
    assert response.status_code == 200


@ pytest.mark.asyncio
async def test_format_sql(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"result": "SELECT 1"}
    response = await client.post(
        "/api/queries/format",
        json={"sql": "select 1"},
        headers=auth_headers,
    )
    assert response.status_code == 200


@ pytest.mark.asyncio
async def test_estimate_query(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"result": {"rows": 100}}
    response = await client.post(
        "/api/queries/estimate",
        json={"database_id": 1, "sql": "SELECT COUNT(*) FROM table"},
        headers=auth_headers,
    )
    assert response.status_code == 200


# --- Novos testes de segurança SQL ---


@pytest.mark.asyncio
async def test_execute_query_select_permitido(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    mock_superset_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_query_with_permitido(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "WITH cte AS (SELECT 1) SELECT * FROM cte"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    mock_superset_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_query_select_space_comment(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "  -- comentario\nSELECT 1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    mock_superset_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_query_insert_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "INSERT INTO table VALUES (1)"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_update_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "UPDATE table SET col = 1"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_delete_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "DELETE FROM table"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_drop_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "DROP TABLE table"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_alter_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "ALTER TABLE table ADD COLUMN col INT"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_truncate_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "TRUNCATE TABLE table"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_vazio_bloqueado(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": ""},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_comment_only(client, mock_superset_client, auth_headers):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "-- so comentario"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_comentario_bloco_nao_fechado_bloqueado(
    client, mock_superset_client, auth_headers,
):
    mock_superset_client.post.assert_not_awaited()
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1 /* comentario sem fechamento"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["status"] == "error"


@pytest.mark.asyncio
async def test_execute_query_comentario_bloco_fechado_permitido(
    client, mock_superset_client, auth_headers,
):
    """Comentario /* */ no meio deve ser ignorado e SELECT deve passar."""
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1 /* comentario */ FROM table"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    mock_superset_client.post.assert_awaited_once()


# --- Limit de linhas (miniaturas de pré-visualização) ---


@pytest.mark.asyncio
async def test_execute_query_limit_envolve_sql(client, mock_superset_client, auth_headers):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1;", "limit": 10},
        headers=auth_headers,
    )
    assert response.status_code == 200
    sent_sql = mock_superset_client.post.await_args.kwargs["json"]["sql"]
    assert "SELECT * FROM" in sent_sql
    assert "LIMIT 10" in sent_sql
    assert ";" not in sent_sql


@pytest.mark.asyncio
async def test_execute_query_sem_limit_mantem_sql_original(
    client, mock_superset_client, auth_headers,
):
    mock_superset_client.post.return_value = {"status": "success"}
    response = await client.post(
        "/api/queries/execute",
        json={"database_id": 1, "sql": "SELECT 1"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    sent_sql = mock_superset_client.post.await_args.kwargs["json"]["sql"]
    assert sent_sql == "SELECT 1"


def test_aplicar_limit_remove_ponto_e_virgula_final():
    from app.superset.queries import aplicar_limit

    assert aplicar_limit("SELECT 1;", 5).endswith("LIMIT 5")
    assert aplicar_limit("SELECT 1", 5).endswith("LIMIT 5")
    assert "AS _preview" in aplicar_limit("WITH cte AS (SELECT 1) SELECT * FROM cte", 5)


def test_aplicar_limit_remove_comentario_final():
    from app.superset.queries import aplicar_limit

    wrapped = aplicar_limit("SELECT 1; -- fim", 7)
    assert "--" not in wrapped
    assert wrapped.endswith("LIMIT 7")
    assert ";" not in wrapped
