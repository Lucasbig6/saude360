from __future__ import annotations

from typing import Any

from app.superset.client import superset_client


def _remover_comentarios(sql: str) -> str:
    """Remove comentários de linha (--) e de bloco (/* ... */) do SQL.

    Levanta ValueError para comentário de bloco não fechado ou SQL que
    ficou vazio após a remoção.
    """
    # --- Remover comentários de linha -- no início de cada linha ---
    lines = sql.split("\n")
    filtered: list[str] = []
    for line in lines:
        stripped = line.strip()
        # Se a linha inteira for um comentário --, pule
        if stripped.startswith("--"):
            continue
        # Remover -- que apareçam depois de conteúdo (até fim de linha)
        idx = line.find("--")
        if idx != -1:
            line = line[:idx]
        filtered.append(line)
    s = "\n".join(filtered).strip()

    if not s:
        raise ValueError(
            "Apenas consultas de leitura (SELECT/WITH) são permitidas."
        )

    # --- Remover comentários /* ... */ (blocos) ---
    # Rastrear se estamos dentro de um bloco de comentário
    in_block = False
    result: list[str] = []
    i = 0
    while i < len(s):
        if not in_block and i + 1 < len(s) and s[i : i + 2] == "/*":
            in_block = True
            i += 2
            continue
        if in_block and i + 1 < len(s) and s[i : i + 2] == "*/":
            in_block = False
            i += 2
            continue
        if not in_block:
            result.append(s[i])
        i += 1

    # Se ainda estiver dentro de bloco, comentário não foi fechado
    if in_block:
        raise ValueError(
            "Apenas consultas de leitura (SELECT/WITH) são permitidas."
        )

    s = "".join(result).strip()

    if not s:
        raise ValueError(
            "Apenas consultas de leitura (SELECT/WITH) são permitidas."
        )

    return s


def validar_sql(sql: str) -> None:
    """Validar que SQL é uma consulta de leitura (SELECT/WITH).

    Considera espaços iniciais e comentários (-- e /* */).
    Não diferencia maiúsculas/minúsculas.
    Levanta ValueError se a consulta for modificadora ou inválida.

    Regras:
    - SQL vazio ou somente comentários → ValueError
    - Comentário de bloco /* ... */ não fechado → ValueError
    - Primeira instrução depois de remover comentários deve ser SELECT ou WITH
    - Não faz busca textual de palavras-chave (DELETE, DROP, etc. podem
      aparecer em strings ou comentários de consultas válidas).
    """
    s = sql.strip()

    if not s:
        raise ValueError(
            "Apenas consultas de leitura (SELECT/WITH) são permitidas."
        )

    s = _remover_comentarios(s)

    # Pegar primeira palavra (ignorando espaços restantes)
    primeiro = s.split()[0].upper()
    if primeiro not in ("SELECT", "WITH"):
        raise ValueError(
            "Apenas consultas de leitura (SELECT/WITH) são permitidas."
        )


def aplicar_limit(sql: str, limit: int) -> str:
    """Envolve a consulta em um subselect com LIMIT.

    Usado para pré-visualizações (miniaturas de gráfico) onde interessa
    apenas uma amostra das linhas, sem transferir o resultset completo.
    Comentários e `;` finais são removidos antes do wrap para não
    invalidar a sintaxe do subselect.
    """
    inner = _remover_comentarios(sql).rstrip(";").strip()
    return f"SELECT * FROM (\n{inner}\n) AS _preview LIMIT {int(limit)}"


async def execute_query(
    database_id: int,
    sql: str,
    schema: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    validar_sql(sql)  # Nova validação de segurança
    if limit is not None and limit > 0:
        sql = aplicar_limit(sql, limit)
    payload: dict[str, Any] = {
        "database_id": database_id,
        "sql": sql,
        "runAsync": False,
    }
    if schema:
        payload["schema"] = schema
    return await superset_client.post("/api/v1/sqllab/execute/", json=payload)


async def format_sql(sql: str) -> dict[str, Any]:
    return await superset_client.post(
        "/api/v1/sqllab/format_sql/",
        json={"sql": sql},
    )


async def estimate_query(database_id: int, sql: str) -> dict[str, Any]:
    return await superset_client.post(
        "/api/v1/sqllab/estimate/",
        json={"database_id": database_id, "sql": sql},
    )
