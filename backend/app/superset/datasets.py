from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.superset.client import superset_client
from app.superset.errors import extract_superset_error

logger = logging.getLogger(__name__)


def _extra_with_display_name(extra: Any, display_name: str) -> str:
    if isinstance(extra, dict):
        metadata = dict(extra)
    elif isinstance(extra, str):
        try:
            parsed = json.loads(extra)
        except json.JSONDecodeError:
            parsed = {}
        metadata = parsed if isinstance(parsed, dict) else {}
    else:
        metadata = {}

    metadata["monisus_display_name"] = display_name
    return json.dumps(metadata, ensure_ascii=False)


async def list_datasets(page: int = 0, page_size: int = 50) -> dict[str, Any]:
    return await superset_client.get(
        "/api/v1/dataset/",
        params={"q": f"(page:{page},page_size:{page_size})"},
    )


async def get_dataset(dataset_id: int | str) -> dict[str, Any]:
    response = await superset_client.get(f"/api/v1/dataset/{dataset_id}")
    result = response.get("result")
    if result is None:
        msg = f"Resposta inválida do Superset para dataset {dataset_id}: campo 'result' ausente"
        raise ValueError(msg)
    return result


async def get_dataset_columns(dataset_id: int) -> dict[str, Any]:
    response = await superset_client.get(f"/api/v1/dataset/{dataset_id}")
    result = response.get("result")
    if result is None:
        msg = f"Resposta inválida do Superset para dataset {dataset_id}: campo 'result' ausente"
        raise ValueError(msg)
    return result


async def get_distinct_values(dataset_id: int, column_name: str) -> dict[str, Any]:
    return await superset_client.get(
        f"/api/v1/dataset/distinct/{column_name}",
        params={"q": f"(dataset_id:{dataset_id})"},
    )


async def refresh_columns(dataset_id: int) -> dict[str, Any]:
    return await superset_client.put(f"/api/v1/dataset/{dataset_id}/refresh")


async def create_dataset(
    database_id: int,
    table_name: str,
    schema: str | None = None,
    description: str | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    """Registra uma tabela existente como dataset no Superset.

    Se já existir um dataset com a mesma tabela e database, retorna o existente.
    """
    # Verificar se já existe dataset com essa tabela neste database
    try:
        existing = await superset_client.get(
            "/api/v1/dataset/",
            params={
                "q": (
                    f"(filters:!((col:table_name,opr:eq,value:'{table_name}')))"
                )
            },
        )
        for ds in existing.get("result", []):
            if ds.get("table_name") == table_name:
                db = ds.get("database", {})
                if db.get("id") == database_id:
                    ds_id = ds.get("id")
                    metadata: dict[str, str] = {}
                    if description:
                        metadata["description"] = description
                    if display_name:
                        metadata["extra"] = _extra_with_display_name(
                            ds.get("extra"), display_name
                        )
                    if ds_id and metadata:
                        try:
                            await superset_client.put(
                                f"/api/v1/dataset/{ds_id}",
                                json=metadata,
                            )
                        except Exception as e:
                            logger.debug(
                                "Não foi possível atualizar descrição no dataset %s",
                                ds_id,
                            )
                            if display_name:
                                raise ValueError(
                                    "Não foi possível salvar o nome do dataset."
                                ) from e
                    return ds
    except ValueError:
        raise
    except Exception:
        logger.debug("Busca de dataset existente falhou, tentando criar")

    payload: dict[str, Any] = {
        "database": database_id,
        "table_name": table_name,
        "schema": schema or "",
    }
    try:
        response = await superset_client.post("/api/v1/dataset/", json=payload)
        result = response.get("data") or response.get("result") or response
        dataset_id = result.get("id") if isinstance(result, dict) else None

        metadata = {}
        if description:
            metadata["description"] = description
        if display_name:
            metadata["extra"] = _extra_with_display_name(
                result.get("extra") if isinstance(result, dict) else None,
                display_name,
            )
        if dataset_id and metadata:
            try:
                await superset_client.put(
                    f"/api/v1/dataset/{dataset_id}",
                    json=metadata,
                )
            except Exception as e:
                logger.debug("Não foi possível definir descrição no dataset %s", dataset_id)
                if display_name:
                    raise ValueError(
                        "Não foi possível salvar o nome do dataset."
                    ) from e

        return result
    except httpx.HTTPStatusError as e:
        detail = extract_superset_error(e)
        logger.warning("Criação de dataset falhou: %s", detail)
        raise ValueError(detail or "Erro ao criar dataset no Superset.") from e
