from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog

logger = logging.getLogger(__name__)

ACTION_AI_TURN = "ai.turn"
ACTION_AI_TOOL_CALL = "ai.tool_call"

RESOURCE_TYPE_AI_SESSION = "ai_session"

MAX_SQL_PERSISTED_CHARS = 2000


def sql_fingerprint(sql: str | None) -> str | None:
    """SHA-256 do SQL — sempre seguro de persistir."""
    if not sql:
        return None
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def _maybe_store_sql(sql: str | None) -> dict[str, Any]:
    """Guarda o SQL completo apenas se ``AI_AUDIT_STORE_SQL=true``.

    Padrão (``false``): guarda somente o hash — a política institucional
    padrão é não reter o texto das consultas em auditoria.
    """
    if not sql:
        return {}
    data: dict[str, Any] = {"sqlSha256": sql_fingerprint(sql)}
    if settings.ai_audit_store_sql:
        data["sql"] = sql[:MAX_SQL_PERSISTED_CHARS]
    return data


def record_ai_event(
    db: Session,
    *,
    action: str,
    session_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    data: dict[str, Any],
) -> None:
    """Grava um evento de IA na tabela ``audit_logs`` (reuso do model existente).

    Nunca persiste segredos: chamadores não devem incluir API keys, tokens
    ou headers de autorização — apenas metadados operacionais.
    """
    safe = {key: value for key, value in data.items() if not _is_secret(key, value)}
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=RESOURCE_TYPE_AI_SESSION,
        resource_id=session_id,
        data=safe,
    )
    db.add(log)


def record_tool_call_event(
    db: Session,
    *,
    session_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    tool_name: str,
    status: str,
    duration_ms: int | None,
    provider: str | None = None,
    model: str | None = None,
    agent_type: str | None = None,
    dataset_id: int | None = None,
    database_id: int | None = None,
    sql: str | None = None,
) -> None:
    data: dict[str, Any] = {
        "tool": tool_name,
        "status": status,
        "durationMs": duration_ms,
        "provider": provider,
        "model": model,
        "agentType": agent_type,
        "datasetId": dataset_id,
        "databaseId": database_id,
    }
    data.update(_maybe_store_sql(sql))
    record_ai_event(
        db,
        action=ACTION_AI_TOOL_CALL,
        session_id=session_id,
        user_id=user_id,
        data={key: value for key, value in data.items() if value is not None},
    )


_SECRET_KEYS = {"api_key", "apikey", "authorization", "token", "secret", "password"}


def _is_secret(key: str, value: Any) -> bool:
    if key.lower() in _SECRET_KEYS:
        return True
    return isinstance(value, str) and value.startswith("Bearer ")
