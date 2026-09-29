from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import audit
from app.ai.orchestrator import Orchestrator, ToolOutcome
from app.ai.policies import AgentPolicy, Scope, build_policy
from app.ai.prompts import get_system_prompt
from app.ai.providers.base import BaseLLMProvider, ChatMessage, ToolCall
from app.ai.schemas import (
    TOOL_STATUS_PENDING_CONFIRMATION,
    StreamEvent,
)
from app.ai.tools import ToolContext, ToolNotAllowedError, ToolRegistry, build_registry
from app.models import AIMessage, AISession, AIToolCall, Analysis, Dashboard
from app.superset import datasets as superset_datasets

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Persistência de um turno (reusa audit_logs para auditoria)
# ---------------------------------------------------------------------------


class DBRecorder:
    """Implementação de ``TurnRecorder`` apoiada no banco + ``audit_logs``."""

    def __init__(
        self,
        db: Session,
        *,
        session: AISession,
        provider: BaseLLMProvider,
    ) -> None:
        self.db = db
        self.session_id = session.id
        self.user_id = session.user_id
        self.agent_type = session.agent_type
        self.provider_name = provider.name
        self.model_name = provider.model
        self.tool_call_count = 0
        self.statuses: set[str] = set()

    # -- mensagens ------------------------------------------------------

    async def append_user(self, content: str) -> uuid.UUID | None:
        return await asyncio.to_thread(self._append, "user", content, None, None)

    async def append_assistant(
        self,
        content: str | None,
        tool_calls: list[dict[str, Any]],
        finish_reason: str | None,
        usage: dict[str, Any] | None,
    ) -> uuid.UUID | None:
        data: dict[str, Any] = {}
        if tool_calls:
            data["toolCalls"] = tool_calls
        if finish_reason:
            data["finishReason"] = finish_reason
        if usage:
            data["usage"] = usage
        return await asyncio.to_thread(
            self._append, "assistant", content, "complete", data
        )

    async def append_tool(
        self,
        tool_call_id: str,
        tool_name: str,
        content: str,
        status: str,
    ) -> uuid.UUID | None:
        return await asyncio.to_thread(
            self._append_tool, tool_call_id, tool_name, content, status
        )

    async def update_message(
        self, message_id: uuid.UUID, *, content: str, status: str
    ) -> None:
        await asyncio.to_thread(self._update_message, message_id, content, status)

    # -- tool calls -----------------------------------------------------

    async def record_tool_call(
        self,
        *,
        tool_call_id: str,
        message_id: uuid.UUID | None,
        tool_name: str,
        arguments: dict[str, Any],
        result: dict[str, Any] | None,
        status: str,
        duration_ms: int | None,
    ) -> None:
        self.tool_call_count += 1
        self.statuses.add(status)
        await asyncio.to_thread(
            self._record_tool_call,
            tool_call_id,
            message_id,
            tool_name,
            arguments,
            result,
            status,
            duration_ms,
        )

    async def update_tool_call(
        self,
        *,
        tool_call_id: str,
        result: dict[str, Any] | None,
        status: str,
        duration_ms: int | None,
    ) -> None:
        self.statuses.add(status)
        await asyncio.to_thread(
            self._update_tool_call, tool_call_id, result, status, duration_ms
        )

    async def record_turn(self, duration_ms: int) -> None:
        await asyncio.to_thread(self._record_turn, duration_ms)

    # -- operações síncronas (rodam em thread) ---------------------------

    def _append(
        self,
        role: str,
        content: str | None,
        status: str | None,
        data: dict[str, Any] | None,
    ) -> uuid.UUID:
        row = AIMessage(
            session_id=self.session_id,
            role=role,
            content=content,
            status=status,
            data=data or {},
        )
        self.db.add(row)
        self.db.commit()
        return row.id

    def _append_tool(
        self, tool_call_id: str, tool_name: str, content: str, status: str
    ) -> uuid.UUID:
        row = AIMessage(
            session_id=self.session_id,
            role="tool",
            content=content,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            status=status,
        )
        self.db.add(row)
        self.db.commit()
        return row.id

    def _update_message(
        self, message_id: uuid.UUID, content: str, status: str
    ) -> None:
        row = self.db.get(AIMessage, message_id)
        if row is None:
            return
        row.content = content
        row.status = status
        self.db.commit()

    def _record_tool_call(
        self,
        tool_call_id: str,
        message_id: uuid.UUID | None,
        tool_name: str,
        arguments: dict[str, Any],
        result: dict[str, Any] | None,
        status: str,
        duration_ms: int | None,
    ) -> None:
        row = AIToolCall(
            session_id=self.session_id,
            message_id=message_id,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            arguments=arguments or {},
            result=result,
            status=status,
            duration_ms=duration_ms,
        )
        self.db.add(row)
        self.db.commit()
        audit.record_tool_call_event(
            self.db,
            session_id=self.session_id,
            user_id=self.user_id,
            tool_name=tool_name,
            status=status,
            duration_ms=duration_ms,
            provider=self.provider_name,
            model=self.model_name,
            agent_type=self.agent_type,
            dataset_id=_int_arg(arguments, "dataset_id"),
            database_id=_int_arg(arguments, "database_id")
            or _int_result(result, "databaseId"),
            sql=_sql_arg(arguments),
        )
        self.db.commit()

    def _update_tool_call(
        self,
        tool_call_id: str,
        result: dict[str, Any] | None,
        status: str,
        duration_ms: int | None,
    ) -> None:
        row = self.db.scalar(
            select(AIToolCall).where(
                AIToolCall.session_id == self.session_id,
                AIToolCall.tool_call_id == tool_call_id,
            )
        )
        if row is None:
            return
        row.result = result
        row.status = status
        if duration_ms is not None:
            row.duration_ms = duration_ms
        self.db.commit()

    def _record_turn(self, duration_ms: int) -> None:
        audit.record_ai_event(
            self.db,
            action=audit.ACTION_AI_TURN,
            session_id=self.session_id,
            user_id=self.user_id,
            data={
                "agentType": self.agent_type,
                "provider": self.provider_name,
                "model": self.model_name,
                "durationMs": duration_ms,
                "toolCalls": self.tool_call_count,
                "statuses": sorted(self.statuses),
            },
        )
        self.db.commit()


# ---------------------------------------------------------------------------
# Escopo autenticado da sessão (imposto pelo backend)
# ---------------------------------------------------------------------------


def dashboard_scope(db: Session, dashboard_id: uuid.UUID) -> Scope:
    dashboard = db.scalar(select(Dashboard).where(Dashboard.id == dashboard_id))
    if dashboard is None:
        return Scope()
    analysis_ids = [widget.analysis_id for widget in dashboard.widgets]
    dataset_ids: set[int] = set()
    database_ids: set[int] = set()
    if analysis_ids:
        rows = db.scalars(select(Analysis).where(Analysis.id.in_(analysis_ids))).all()
        for row in rows:
            if row.dataset_id is not None:
                dataset_ids.add(row.dataset_id)
            if row.database_id is not None:
                database_ids.add(row.database_id)
    return Scope(
        dashboard_id=dashboard_id,
        dataset_ids=frozenset(dataset_ids),
        database_ids=frozenset(database_ids),
    )


async def build_scope(db: Session, session: AISession) -> Scope:
    if session.dashboard_id is not None:
        return await asyncio.to_thread(dashboard_scope, db, session.dashboard_id)
    if session.dataset_id is not None:
        database_ids: set[int] = set()
        try:
            dataset = await superset_datasets.get_dataset(session.dataset_id)
            database = dataset.get("database") if isinstance(dataset, dict) else None
            if isinstance(database, dict) and isinstance(database.get("id"), int):
                database_ids.add(database["id"])
        except Exception as exc:  # noqa: BLE001 - melhor esforço
            logger.warning(
                "Não foi possível resolver o database do dataset %s: %s",
                session.dataset_id,
                exc,
            )
        return Scope(
            dataset_ids=frozenset({session.dataset_id}),
            database_ids=frozenset(database_ids),
        )
    return Scope()


# ---------------------------------------------------------------------------
# Histórico
# ---------------------------------------------------------------------------


def load_messages(db: Session, session_id: uuid.UUID) -> list[AIMessage]:
    stmt = (
        select(AIMessage)
        .where(AIMessage.session_id == session_id)
        .order_by(AIMessage.created_at, AIMessage.id)
    )
    return list(db.scalars(stmt).all())


def to_chat_messages(rows: list[AIMessage]) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    for row in rows:
        if row.role == "assistant":
            raw_tool_calls = row.data.get("toolCalls") or []
            tool_calls = [
                ToolCall(
                    id=str(item.get("id") or ""),
                    name=str(item.get("name") or ""),
                    arguments=item.get("arguments") or {},
                )
                for item in raw_tool_calls
                if isinstance(item, dict)
            ]
            messages.append(
                ChatMessage(role="assistant", content=row.content, tool_calls=tool_calls)
            )
        elif row.role == "tool":
            messages.append(
                ChatMessage(
                    role="tool",
                    content=row.content or "{}",
                    tool_call_id=row.tool_call_id,
                )
            )
        else:
            messages.append(ChatMessage(role=row.role, content=row.content or ""))
    return messages


# ---------------------------------------------------------------------------
# Confirmação de tools de escrita (vinculada ao tool_call_id)
# ---------------------------------------------------------------------------


async def apply_confirmations(
    *,
    db: Session,
    session: AISession,
    policy: AgentPolicy,
    registry: ToolRegistry,
    recorder: DBRecorder,
    orchestrator: Orchestrator,
    confirm_tool_call_ids: list[str],
) -> None:
    for tool_call_id in confirm_tool_call_ids:
        row = await asyncio.to_thread(_pending_tool_message, db, session.id, tool_call_id)
        if row is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"tool_call_id sem confirmação pendente nesta sessão: "
                    f"{tool_call_id}"
                ),
            )
        record = await asyncio.to_thread(_tool_call_record, db, session.id, tool_call_id)
        arguments: dict[str, Any] = dict(record.arguments) if record else {}
        if not arguments and isinstance(row.data, dict):
            arguments = dict(row.data.get("arguments") or {})
        tool_name = row.tool_name or (record.tool_name if record else "")
        if not tool_name:
            raise HTTPException(
                status_code=400, detail=f"tool_call_id sem tool associada: {tool_call_id}"
            )
        try:
            spec = registry.resolve(tool_name, policy)
        except ToolNotAllowedError as exc:
            outcome = ToolOutcome(status="denied", data={"error": str(exc)})
        else:
            outcome = await orchestrator.execute(spec, arguments)
        await recorder.update_message(
            row.id,
            content=json.dumps(outcome.data, ensure_ascii=False, default=str),
            status=outcome.status,
        )
        await recorder.update_tool_call(
            tool_call_id=tool_call_id,
            result=outcome.data,
            status=outcome.status,
            duration_ms=outcome.duration_ms,
        )


def _pending_tool_message(
    db: Session, session_id: uuid.UUID, tool_call_id: str
) -> AIMessage | None:
    return db.scalar(
        select(AIMessage).where(
            AIMessage.session_id == session_id,
            AIMessage.role == "tool",
            AIMessage.tool_call_id == tool_call_id,
            AIMessage.status == TOOL_STATUS_PENDING_CONFIRMATION,
        )
    )


def _tool_call_record(
    db: Session, session_id: uuid.UUID, tool_call_id: str
) -> AIToolCall | None:
    return db.scalar(
        select(AIToolCall).where(
            AIToolCall.session_id == session_id,
            AIToolCall.tool_call_id == tool_call_id,
        )
    )


# ---------------------------------------------------------------------------
# Turno completo
# ---------------------------------------------------------------------------


async def prepare_turn(
    *,
    db: Session,
    session: AISession,
    content: str | None,
    confirm_tool_call_ids: list[str],
    provider: BaseLLMProvider,
    registry: ToolRegistry | None = None,
) -> AsyncIterator[StreamEvent]:
    """Prepara e devolve o gerador de eventos de um turno.

    Todo o trabalho prévio (escopo, confirmações, histórico) acontece aqui —
    antes do StreamingResponse — para que erros virem HTTP status correto.
    """
    registry = registry or build_registry()
    scope = await build_scope(db, session)
    policy = build_policy(session.agent_type, scope)
    recorder = DBRecorder(db, session=session, provider=provider)
    tool_context = ToolContext(
        agent_type=session.agent_type,
        policy=policy,
        user_id=session.user_id,
        session_id=session.id,
        db=db,
    )
    orchestrator = Orchestrator(
        provider=provider,
        registry=registry,
        policy=policy,
        system_prompt=get_system_prompt(session.agent_type),
        tool_context=tool_context,
        recorder=recorder,
    )

    if confirm_tool_call_ids:
        await apply_confirmations(
            db=db,
            session=session,
            policy=policy,
            registry=registry,
            recorder=recorder,
            orchestrator=orchestrator,
            confirm_tool_call_ids=confirm_tool_call_ids,
        )

    history = to_chat_messages(await asyncio.to_thread(load_messages, db, session.id))

    text = (content or "").strip()
    if text:
        await recorder.append_user(text)
        history.append(ChatMessage(role="user", content=text))

    return _run_with_audit(orchestrator, recorder, history)


async def _run_with_audit(
    orchestrator: Orchestrator,
    recorder: DBRecorder,
    history: list[ChatMessage],
) -> AsyncIterator[StreamEvent]:
    started = time.perf_counter()
    try:
        async for event in orchestrator.run(history):
            yield event
    finally:
        try:
            await recorder.record_turn(
                int((time.perf_counter() - started) * 1000)
            )
        except Exception:  # noqa: BLE001 - auditoria nunca derruba o turno
            logger.exception("Falha ao registrar auditoria do turno de IA")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _int_arg(arguments: dict[str, Any], key: str) -> int | None:
    value = arguments.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _int_result(result: dict[str, Any] | None, key: str) -> int | None:
    if not isinstance(result, dict):
        return None
    value = result.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _sql_arg(arguments: dict[str, Any]) -> str | None:
    value = arguments.get("sql")
    return value if isinstance(value, str) else None
