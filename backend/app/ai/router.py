from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service
from app.ai.providers.base import BaseLLMProvider, ProviderNotConfiguredError
from app.ai.providers.factory import create_provider
from app.ai.schemas import (
    EVENT_ERROR,
    AIMessageCreate,
    AIMessageResponse,
    AISessionCreate,
    AISessionResponse,
    StreamEvent,
)
from app.ai.streaming import sse_format
from app.auth.dependencies import get_created_by, get_current_token
from app.core.config import settings
from app.db.session import get_db
from app.models import AIMessage, AISession, Dashboard

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


def get_llm_provider() -> BaseLLMProvider:
    """Provider injetado por configuração — único ponto de troca.

    Testes substituem esta dependência (``app.dependency_overrides``);
    o frontend nunca enxerga o provider.
    """
    try:
        return create_provider(settings)
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _session_dto(row: AISession) -> dict[str, Any]:
    return {
        "id": row.id,
        "agent_type": row.agent_type,
        "dashboard_id": row.dashboard_id,
        "dataset_id": row.dataset_id,
        "title": row.title,
        "provider": row.provider,
        "model": row.model,
        "metadata": row.data or {},
        "created_by": row.user_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _message_dto(row: AIMessage) -> dict[str, Any]:
    return {
        "id": row.id,
        "session_id": row.session_id,
        "role": row.role,
        "content": row.content,
        "tool_call_id": row.tool_call_id,
        "tool_name": row.tool_name,
        "status": row.status,
        "metadata": row.data or {},
        "created_at": row.created_at,
    }


def _get_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID | None) -> AISession:
    session = db.get(AISession, session_id)
    # Igualdade estrita: evita vazar sessões entre usuários (inclusive o
    # caso "usuário local não resolvido" = None).
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Sessão de IA não encontrada")
    return session


def _resolve_dashboard(
    db: Session, dashboard_id: uuid.UUID, user_id: uuid.UUID | None
) -> Dashboard:
    """Dashboard precisa existir e, quando tem dono, pertencer ao usuário.

    O restante da API é single-tenant (qualquer autenticado lê qualquer
    dashboard), mas a sessão de IA cria um contexto de análise pessoal:
    um dashboard com dono diferente não pode virar escopo de IA do usuário.
    """
    dashboard = db.get(Dashboard, dashboard_id)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard não encontrado")
    if (
        dashboard.created_by is not None
        and user_id is not None
        and dashboard.created_by != user_id
    ):
        raise HTTPException(
            status_code=403, detail="Dashboard não disponível para este usuário"
        )
    return dashboard


@router.post("/sessions", status_code=201, response_model=AISessionResponse)
def create_session(
    payload: AISessionCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
    provider: BaseLLMProvider = Depends(get_llm_provider),
) -> AISessionResponse:
    if payload.agent_type == "dashboard_copilot":
        if payload.dashboard_id is None:
            raise HTTPException(
                status_code=422,
                detail="dashboardId é obrigatório para dashboard_copilot.",
            )
        _resolve_dashboard(db, payload.dashboard_id, created_by)
    elif payload.agent_type == "explorer":
        if payload.dataset_id is None:
            raise HTTPException(
                status_code=422,
                detail="datasetId é obrigatório para explorer.",
            )

    session = AISession(
        user_id=created_by,
        agent_type=payload.agent_type,
        dashboard_id=payload.dashboard_id,
        dataset_id=payload.dataset_id,
        title=payload.title,
        provider=provider.name,
        model=provider.model,
        data=payload.metadata or {},
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return AISessionResponse.model_validate(_session_dto(session))


@router.get("/sessions", response_model=list[AISessionResponse])
def list_sessions(
    dashboard_id: uuid.UUID | None = Query(None, alias="dashboardId"),
    dataset_id: int | None = Query(None, alias="datasetId"),
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
) -> list[AISessionResponse]:
    """Sessões próprias de um dashboard ou dataset (para o frontend retomar)."""
    if (dashboard_id is None) == (dataset_id is None):
        raise HTTPException(
            status_code=422,
            detail="Informe exatamente um de: dashboardId, datasetId.",
        )

    stmt = select(AISession).where(AISession.user_id == created_by)
    if dashboard_id is not None:
        _resolve_dashboard(db, dashboard_id, created_by)
        stmt = stmt.where(AISession.dashboard_id == dashboard_id)
    else:
        stmt = stmt.where(AISession.dataset_id == dataset_id)

    rows = db.scalars(
        stmt.order_by(AISession.updated_at.desc(), AISession.created_at.desc())
    ).all()
    return [AISessionResponse.model_validate(_session_dto(row)) for row in rows]


@router.get("/sessions/{session_id}", response_model=AISessionResponse)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
) -> AISessionResponse:
    session = _get_session(db, session_id, created_by)
    return AISessionResponse.model_validate(_session_dto(session))


@router.get(
    "/sessions/{session_id}/messages", response_model=list[AIMessageResponse]
)
def list_messages(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
) -> list[AIMessageResponse]:
    session = _get_session(db, session_id, created_by)
    rows = db.scalars(
        select(AIMessage)
        .where(AIMessage.session_id == session.id)
        .order_by(AIMessage.created_at, AIMessage.id)
    ).all()
    return [AIMessageResponse.model_validate(_message_dto(row)) for row in rows]


async def _event_stream(events: AsyncIterator[StreamEvent]) -> AsyncIterator[str]:
    try:
        async for event in events:
            yield sse_format(event)
    except Exception as exc:  # noqa: BLE001 - stream já iniciado: vira evento
        logger.exception("Falha durante o stream de IA: %s", exc)
        yield sse_format(
            StreamEvent(
                EVENT_ERROR,
                {
                    "code": "internal",
                    "message": "Erro interno ao processar a mensagem.",
                },
            )
        )


@router.post("/sessions/{session_id}/messages")
async def post_message(
    session_id: uuid.UUID,
    payload: AIMessageCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
    provider: BaseLLMProvider = Depends(get_llm_provider),
) -> StreamingResponse:
    """Envia uma mensagem e recebe a resposta do agente via SSE.

    Eventos: ``message_start``, ``token``, ``tool_call``, ``tool_result``,
    ``confirmation_required``, ``message_complete``, ``error``.
    """
    session = _get_session(db, session_id, created_by)
    events = await service.prepare_turn(
        db=db,
        session=session,
        content=payload.content,
        confirm_tool_call_ids=payload.confirm_tool_call_ids,
        provider=provider,
    )
    return StreamingResponse(
        _event_stream(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
