from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.superset.client import superset_client
from app.superset.errors import SupersetAPIError, extract_superset_error, sanitize_database

logger = logging.getLogger(__name__)


def _build_sqlalchemy_uri(
    *,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
) -> str:
    user = quote_plus(username)
    pwd = quote_plus(password)
    return f"postgresql://{user}:{pwd}@{host}:{port}/{database}"


async def list_databases() -> dict[str, Any]:
    response = await superset_client.get(
        "/api/v1/database/",
        params={"q": "(page:0,page_size:100)"},
    )
    result = response.get("result", [])
    response["result"] = [sanitize_database(db) for db in result]
    return response


async def get_database(database_id: int) -> dict[str, Any]:
    response = await superset_client.get(f"/api/v1/database/{database_id}")
    result = response.get("result")
    if result is None:
        msg = f"Database {database_id} não encontrado"
        raise ValueError(msg)
    return sanitize_database(result)



async def create_database(data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "database_name": data["database_name"],
        "sqlalchemy_uri": _build_sqlalchemy_uri(
            host=data["host"],
            port=data["port"],
            database=data["database"],
            username=data["username"],
            password=data["password"],
        ),
        "expose_in_sqllab": True,
        # True: publicar dataset usa CTAS (select_as_cta). Alinhado ao seed
        # demo e a materialize_query — fonte criada pela UI publica sem erro.
        "allow_ctas": True,
        "allow_cvas": True,
        "allow_dml": False,
        "allow_run_async": False,
    }
    try:
        response = await superset_client.post("/api/v1/database/", json=payload)
        return response
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Criação de database falhou: %s", detail)
        raise SupersetAPIError(detail or "Erro ao criar fonte de dados.") from e


async def update_database(database_id: int, data: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if "database_name" in data:
        payload["database_name"] = data["database_name"]
    if all(k in data for k in ("host", "port", "database", "username", "password")):
        payload["sqlalchemy_uri"] = _build_sqlalchemy_uri(
            host=data["host"],
            port=data["port"],
            database=data["database"],
            username=data["username"],
            password=data["password"],
        )
    try:
        response = await superset_client.put(
            f"/api/v1/database/{database_id}", json=payload
        )
        return response
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Atualização de database falhou: %s", detail)
        raise SupersetAPIError(detail or "Erro ao atualizar fonte de dados.") from e


async def delete_database(database_id: int) -> Any:
    # Remove datasets associados antes de deletar o database
    try:
        datasets_resp = await get_database_datasets(database_id)
        for ds in datasets_resp.get("result", []):
            ds_id = ds.get("id")
            if ds_id:
                try:
                    await superset_client.delete(f"/api/v1/dataset/{ds_id}")
                except Exception:
                    logger.debug("Não foi possível remover dataset %s", ds_id)
    except Exception:
        logger.debug("Não foi possível listar datasets para remoção")

    return await superset_client.delete(f"/api/v1/database/{database_id}")


async def test_connection(data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "database_name": data.get("database_name", "test"),
        "sqlalchemy_uri": _build_sqlalchemy_uri(
            host=data["host"],
            port=data["port"],
            database=data["database"],
            username=data["username"],
            password=data["password"],
        ),
    }
    try:
        await superset_client.post(
            "/api/v1/database/test_connection/", json=payload
        )
        return {"success": True, "message": "Conexão realizada com sucesso."}
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Teste de conexão falhou: %s", detail)
        return {
            "success": False,
            "message": "Não foi possível conectar ao banco.",
            "detail": detail,
        }
    except Exception as e:
        logger.warning("Teste de conexão falhou: %s", e)
        return {"success": False, "message": "Não foi possível conectar ao banco."}


async def get_database_datasets(database_id: int) -> dict[str, Any]:
    # A API do Superset não permite filtrar /api/v1/dataset/ por database_id
    # ("Filter column: database_id not allowed to filter"). Lista em páginas
    # e filtra pelo id do database na resposta.
    page = 0
    page_size = 200
    matched: list[dict[str, Any]] = []
    total_count = 0

    while True:
        response = await superset_client.get(
            "/api/v1/dataset/",
            params={"q": f"(page:{page},page_size:{page_size})"},
        )
        result = response.get("result") or []
        if page == 0:
            total_count = int(response.get("count") or 0)

        for ds in result:
            db = ds.get("database") or {}
            if db.get("id") == database_id:
                matched.append(ds)

        page += 1
        if not result or page * page_size >= total_count:
            break

    return {"count": len(matched), "result": matched}


async def get_database_schemas(database_id: int) -> dict[str, Any]:
    """Lista schemas de um database via Superset API."""
    try:
        response = await superset_client.get(
            f"/api/v1/database/{database_id}/schemas/",
        )
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Listagem de schemas falhou para database %s: %s", database_id, detail)
        raise SupersetAPIError(
            detail or "Não foi possível listar os schemas desta fonte de dados."
        ) from e
    schemas = response.get("result", [])
    return {"schemas": schemas}


async def get_database_tables(database_id: int, schema: str) -> dict[str, Any]:
    """Lista tabelas de um schema via Superset API."""
    try:
        response = await superset_client.get(
            f"/api/v1/database/{database_id}/tables/",
            params={"q": f"(schema_name:'{schema}')"},
        )
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Listagem de tabelas falhou para database %s: %s", database_id, detail)
        raise SupersetAPIError(
            detail or "Não foi possível listar as tabelas desta fonte de dados."
        ) from e
    raw_tables = response.get("result", [])
    tables = [
        {"name": t.get("value", ""), "type": t.get("type", "table")}
        for t in raw_tables
        if t.get("value")
    ]
    return {"schema": schema, "tables": tables}


async def get_table_metadata(
    database_id: int, schema: str, table: str
) -> dict[str, Any]:
    """Obtém metadados das colunas de uma tabela via Superset API."""
    response = await superset_client.get(
        f"/api/v1/database/{database_id}/table_metadata/",
        params={"name": table, "schema": schema},
    )
    columns = []
    for col in response.get("columns", []):
        columns.append({
            "name": col.get("name", ""),
            "type": col.get("type", ""),
            "long_type": col.get("longType", ""),
            "keys": col.get("keys", []),
        })
    return {
        "table": table,
        "schema": schema,
        "columns": columns,
        "select_star": response.get("selectStar", ""),
    }
