from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

from app.ai.policies import AgentPolicy, ToolPolicyError
from app.ai.providers.base import (
    BaseLLMProvider,
    ChatMessage,
    ResponseAccumulator,
    ToolCall,
)
from app.ai.schemas import (
    EVENT_CONFIRMATION_REQUIRED,
    EVENT_ERROR,
    EVENT_MESSAGE_COMPLETE,
    EVENT_MESSAGE_START,
    EVENT_TOKEN,
    EVENT_TOOL_CALL,
    EVENT_TOOL_RESULT,
    TOOL_STATUS_DENIED,
    TOOL_STATUS_ERROR,
    TOOL_STATUS_OK,
    TOOL_STATUS_PENDING_CONFIRMATION,
    StreamEvent,
)
from app.ai.tools.registry import ToolContext, ToolNotAllowedError, ToolRegistry, ToolSpec

logger = logging.getLogger(__name__)


def _dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


@dataclass
class ToolOutcome:
    status: str
    data: dict[str, Any]
    duration_ms: int = 0


class TurnRecorder(Protocol):
    """Persistência de um turno — implementada em ``service`` (banco).

    Mantém o orquestrador desacoplado de SQLAlchemy: nos testes unitários
    basta uma implementação em memória.
    """

    async def append_assistant(
        self,
        content: str | None,
        tool_calls: list[dict[str, Any]],
        finish_reason: str | None,
        usage: dict[str, Any] | None,
    ) -> uuid.UUID | None: ...

    async def append_tool(
        self,
        tool_call_id: str,
        tool_name: str,
        content: str,
        status: str,
    ) -> uuid.UUID | None: ...

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
    ) -> None: ...


class NullRecorder:
    """Recorder descartável (turnos sem persistência)."""

    async def append_assistant(
        self,
        content: str | None,
        tool_calls: list[dict[str, Any]],
        finish_reason: str | None,
        usage: dict[str, Any] | None,
    ) -> uuid.UUID | None:
        return None

    async def append_tool(
        self,
        tool_call_id: str,
        tool_name: str,
        content: str,
        status: str,
    ) -> uuid.UUID | None:
        return None

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
        return None


class Orchestrator:
    """Loop genérico de tool-calling.

    usuário → LLM → tool_call → ToolRegistry → execução → resultado → LLM
    → ... → resposta final.

    O orquestrador não conhece Superset, SQL nem provider específico: usa
    apenas ``BaseLLMProvider``, ``ToolRegistry`` e ``AgentPolicy``.
    """

    def __init__(
        self,
        *,
        provider: BaseLLMProvider,
        registry: ToolRegistry,
        policy: AgentPolicy,
        system_prompt: str,
        tool_context: ToolContext,
        recorder: TurnRecorder | None = None,
    ) -> None:
        self.provider = provider
        self.registry = registry
        self.policy = policy
        self.system_prompt = system_prompt
        self.tool_context = tool_context
        self.recorder = recorder or NullRecorder()
        self.provider_specs = registry.provider_specs(policy)

    # ------------------------------------------------------------------
    # Execução de tools (compartilhada com o fluxo de confirmação)
    # ------------------------------------------------------------------

    async def execute(self, spec: ToolSpec, arguments: dict[str, Any]) -> ToolOutcome:
        started = time.perf_counter()
        if not spec.is_allowed_for(self.policy.agent_type) or not self.policy.allows(
            spec.name
        ):
            return ToolOutcome(
                status=TOOL_STATUS_DENIED,
                data={
                    "error": (
                        f"Tool '{spec.name}' não permitida para o agente "
                        f"'{self.policy.agent_type}'."
                    )
                },
            )
        try:
            data = await asyncio.wait_for(
                spec.handler(self.tool_context, dict(arguments)),
                timeout=self.policy.tool_timeout,
            )
        except ToolPolicyError as exc:
            return ToolOutcome(
                status=TOOL_STATUS_DENIED,
                data={"error": str(exc)},
                duration_ms=_ms(started),
            )
        except ToolNotAllowedError as exc:
            return ToolOutcome(
                status=TOOL_STATUS_DENIED,
                data={"error": str(exc)},
                duration_ms=_ms(started),
            )
        except TimeoutError:
            return ToolOutcome(
                status=TOOL_STATUS_ERROR,
                data={
                    "error": (
                        f"Tempo limite de execução excedido "
                        f"({self.policy.tool_timeout:g}s)."
                    )
                },
                duration_ms=_ms(started),
            )
        except Exception as exc:  # noqa: BLE001 - erro de tool vira resultado p/ LLM
            logger.warning("Tool '%s' falhou: %s", spec.name, exc)
            return ToolOutcome(
                status=TOOL_STATUS_ERROR,
                data={"error": str(exc)[:500] or exc.__class__.__name__},
                duration_ms=_ms(started),
            )
        if not isinstance(data, dict):
            data = {"result": data}
        return ToolOutcome(
            status=TOOL_STATUS_OK, data=data, duration_ms=_ms(started)
        )

    # ------------------------------------------------------------------
    # Turno
    # ------------------------------------------------------------------

    async def run(
        self, history: list[ChatMessage]
    ) -> AsyncIterator[StreamEvent]:
        messages = [ChatMessage(role="system", content=self.system_prompt), *history]
        yield StreamEvent(
            EVENT_MESSAGE_START,
            {
                "agentType": self.policy.agent_type,
                "provider": self.provider.name,
                "model": self.provider.model,
                "sessionId": str(self.tool_context.session_id or "")
                or None,
            },
        )

        executed_tool_calls = 0

        for _step in range(1, self.policy.max_steps + 1):
            try:
                accumulator = ResponseAccumulator()
                async for chunk in self.provider.chat_stream(
                    messages, tools=self.provider_specs
                ):
                    if chunk.content_delta:
                        yield StreamEvent(EVENT_TOKEN, {"delta": chunk.content_delta})
                    accumulator.add(chunk)
                response = accumulator.build()
            except Exception as exc:  # noqa: BLE001 - erro do provider vira evento
                logger.warning("Falha no provider '%s': %s", self.provider.name, exc)
                yield StreamEvent(
                    EVENT_ERROR,
                    {
                        "code": "provider_error",
                        "message": "Não foi possível obter resposta do modelo.",
                    },
                )
                return

            for index, tool_call in enumerate(response.tool_calls):
                if not tool_call.id:
                    tool_call.id = f"call_{uuid.uuid4().hex[:16]}_{index}"

            await self.recorder.append_assistant(
                response.content,
                _tool_calls_payload(response.tool_calls),
                response.finish_reason,
                response.usage.to_dict() if response.usage else None,
            )
            messages.append(
                ChatMessage(
                    role="assistant",
                    content=response.content,
                    tool_calls=response.tool_calls,
                )
            )

            if not response.tool_calls:
                yield StreamEvent(
                    EVENT_MESSAGE_COMPLETE,
                    {
                        "content": response.content,
                        "finishReason": response.finish_reason or "stop",
                        "usage": response.usage.to_dict() if response.usage else None,
                        "pendingConfirmation": False,
                    },
                )
                return

            pending_confirmation = False
            for tool_call in response.tool_calls:
                yield StreamEvent(
                    EVENT_TOOL_CALL,
                    {
                        "toolCallId": tool_call.id,
                        "name": tool_call.name,
                        "arguments": tool_call.arguments,
                    },
                )
                outcome = await self._resolve_and_run(
                    tool_call, executed_tool_calls
                )
                if outcome.status == TOOL_STATUS_OK:
                    executed_tool_calls += 1

                content = _dumps(outcome.data)
                tool_message_id = await self.recorder.append_tool(
                    tool_call.id, tool_call.name, content, outcome.status
                )
                await self.recorder.record_tool_call(
                    tool_call_id=tool_call.id,
                    message_id=tool_message_id,
                    tool_name=tool_call.name,
                    arguments=tool_call.arguments,
                    result=outcome.data,
                    status=outcome.status,
                    duration_ms=outcome.duration_ms,
                )
                messages.append(
                    ChatMessage(
                        role="tool", content=content, tool_call_id=tool_call.id
                    )
                )
                yield StreamEvent(
                    EVENT_TOOL_RESULT,
                    {
                        "toolCallId": tool_call.id,
                        "name": tool_call.name,
                        "status": outcome.status,
                        "data": outcome.data,
                        "durationMs": outcome.duration_ms,
                    },
                )
                if outcome.status == TOOL_STATUS_PENDING_CONFIRMATION:
                    pending_confirmation = True
                    yield StreamEvent(
                        EVENT_CONFIRMATION_REQUIRED,
                        {
                            "toolCallId": tool_call.id,
                            "name": tool_call.name,
                            "arguments": tool_call.arguments,
                        },
                    )

            if pending_confirmation:
                # Turno encerra: o histórico fica assistente → tool(pendente)
                # e a próxima chamada executa após confirmToolCallIds.
                yield StreamEvent(
                    EVENT_MESSAGE_COMPLETE,
                    {
                        "content": None,
                        "finishReason": "confirmation_required",
                        "usage": response.usage.to_dict() if response.usage else None,
                        "pendingConfirmation": True,
                    },
                )
                return

        yield StreamEvent(
            EVENT_ERROR,
            {
                "code": "max_steps",
                "message": (
                    f"Limite de {self.policy.max_steps} passos atingido "
                    "antes de uma resposta final."
                ),
            },
        )

    async def _resolve_and_run(
        self, tool_call: ToolCall, executed_so_far: int
    ) -> ToolOutcome:
        try:
            spec = self.registry.resolve(tool_call.name, self.policy)
        except ToolNotAllowedError as exc:
            return ToolOutcome(
                status=TOOL_STATUS_DENIED, data={"error": str(exc)}
            )

        if self.policy.requires_confirmation(
            tool_call.name, spec_confirms=spec.requires_confirmation
        ):
            return ToolOutcome(
                status=TOOL_STATUS_PENDING_CONFIRMATION,
                data={
                    "message": (
                        "Ação que altera dados aguarda confirmação do usuário."
                    ),
                    "toolCallId": tool_call.id,
                },
            )

        if executed_so_far >= self.policy.max_tool_calls:
            return ToolOutcome(
                status=TOOL_STATUS_DENIED,
                data={
                    "error": (
                        f"Limite de {self.policy.max_tool_calls} chamadas de "
                        "ferramenta por turno atingido."
                    )
                },
            )

        return await self.execute(spec, tool_call.arguments)


def _tool_calls_payload(tool_calls: list[ToolCall]) -> list[dict[str, Any]]:
    return [
        {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
        for tc in tool_calls
    ]


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
