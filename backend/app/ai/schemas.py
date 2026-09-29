from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

AgentType = Literal["dashboard_copilot", "explorer"]

AGENT_TYPES: tuple[str, ...] = ("dashboard_copilot", "explorer")

# Status possíveis de um AIMessage (role="tool") / AIToolCall.
TOOL_STATUS_OK = "ok"
TOOL_STATUS_ERROR = "error"
TOOL_STATUS_DENIED = "denied"
TOOL_STATUS_PENDING_CONFIRMATION = "pending_confirmation"

TOOL_STATUSES: tuple[str, ...] = (
    TOOL_STATUS_OK,
    TOOL_STATUS_ERROR,
    TOOL_STATUS_DENIED,
    TOOL_STATUS_PENDING_CONFIRMATION,
)


class CamelModel(BaseModel):
    """Base dos payloads públicos: JSON em camelCase (tipos do frontend)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ---------------------------------------------------------------------------
# Eventos de streaming (SSE)
# ---------------------------------------------------------------------------

EVENT_MESSAGE_START = "message_start"
EVENT_TOKEN = "token"
EVENT_TOOL_CALL = "tool_call"
EVENT_TOOL_RESULT = "tool_result"
EVENT_CONFIRMATION_REQUIRED = "confirmation_required"
EVENT_MESSAGE_COMPLETE = "message_complete"
EVENT_ERROR = "error"

STREAM_EVENTS: tuple[str, ...] = (
    EVENT_MESSAGE_START,
    EVENT_TOKEN,
    EVENT_TOOL_CALL,
    EVENT_TOOL_RESULT,
    EVENT_CONFIRMATION_REQUIRED,
    EVENT_MESSAGE_COMPLETE,
    EVENT_ERROR,
)


@dataclass
class StreamEvent:
    """Evento normalizado emitido durante um turno do agente."""

    type: str
    data: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# API — sessões e mensagens
# ---------------------------------------------------------------------------


class AISessionCreate(CamelModel):
    agent_type: AgentType
    dashboard_id: uuid.UUID | None = None
    dataset_id: int | None = None
    title: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AISessionResponse(CamelModel):
    id: uuid.UUID
    agent_type: AgentType
    dashboard_id: uuid.UUID | None = None
    dataset_id: int | None = None
    title: str | None = None
    provider: str | None = None
    model: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class AIMessageCreate(CamelModel):
    """Corpo de POST /ai/sessions/{id}/messages.

    ``content`` é obrigatório exceto quando ``confirmToolCallIds`` está
    presente (turno de confirmação de tools de escrita).
    """

    content: str | None = Field(default=None, max_length=20000)
    confirm_tool_call_ids: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _require_content_or_confirmation(self) -> AIMessageCreate:
        if not (self.content and self.content.strip()) and not self.confirm_tool_call_ids:
            raise ValueError("Informe o conteúdo da mensagem ou toolCallIds a confirmar.")
        return self


class AIMessageResponse(CamelModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    status: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
