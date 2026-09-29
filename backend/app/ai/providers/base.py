from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any


class ProviderError(RuntimeError):
    """Erro de comunicação/uso de um provider LLM.

    A mensagem NUNCA deve conter segredos (API keys, headers de autenticação).
    """


class ProviderNotConfiguredError(ProviderError):
    """Provider ausente ou incompleto nas configurações (``AI_*``)."""


@dataclass
class ToolCall:
    """Tool call normalizado (independente do formato do provider)."""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)
    raw_arguments: str | None = None


@dataclass
class LLMUsage:
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None

    @classmethod
    def from_payload(cls, payload: Any) -> LLMUsage | None:
        if not isinstance(payload, dict):
            return None
        return cls(
            prompt_tokens=payload.get("prompt_tokens"),
            completion_tokens=payload.get("completion_tokens"),
            total_tokens=payload.get("total_tokens"),
        )

    def to_dict(self) -> dict[str, int]:
        data: dict[str, int] = {}
        if self.prompt_tokens is not None:
            data["promptTokens"] = self.prompt_tokens
        if self.completion_tokens is not None:
            data["completionTokens"] = self.completion_tokens
        if self.total_tokens is not None:
            data["totalTokens"] = self.total_tokens
        return data


@dataclass
class LLMResponse:
    """Resposta normalizada de um turno do modelo."""

    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str | None = None
    usage: LLMUsage | None = None
    model: str | None = None


@dataclass
class ToolCallDelta:
    """Delta parcial de um tool call durante o streaming."""

    index: int = 0
    id: str | None = None
    name: str | None = None
    arguments_delta: str | None = None


@dataclass
class LLMChunk:
    """Delta normalizado durante o streaming."""

    content_delta: str | None = None
    tool_call_delta: ToolCallDelta | None = None
    finish_reason: str | None = None
    usage: LLMUsage | None = None
    model: str | None = None


@dataclass
class ChatMessage:
    """Mensagem normalizada na conversa (formato interno do orquestrador)."""

    role: str  # system | user | assistant | tool
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None


def parse_tool_arguments(raw: Any) -> dict[str, Any]:
    """Converte ``function.arguments`` (JSON string) em dict; nunca levanta."""
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def dump_tool_arguments(arguments: dict[str, Any]) -> str:
    """Serializa argumentos de tool call para o formato do provider."""
    return json.dumps(arguments, ensure_ascii=False, default=str)


class ResponseAccumulator:
    """Acumula ``LLMChunk`` de um streaming e produz um ``LLMResponse``."""

    def __init__(self) -> None:
        self._content: list[str] = []
        self._tool_calls: dict[int, dict[str, Any]] = {}
        self.finish_reason: str | None = None
        self.usage: LLMUsage | None = None
        self.model: str | None = None

    def add(self, chunk: LLMChunk) -> None:
        if chunk.content_delta:
            self._content.append(chunk.content_delta)
        delta = chunk.tool_call_delta
        if delta is not None:
            entry = self._tool_calls.setdefault(
                delta.index, {"id": None, "name": None, "arguments": []}
            )
            if delta.id:
                entry["id"] = delta.id
            if delta.name:
                entry["name"] = delta.name
            if delta.arguments_delta:
                entry["arguments"].append(delta.arguments_delta)
        if chunk.finish_reason:
            self.finish_reason = chunk.finish_reason
        if chunk.usage is not None:
            self.usage = chunk.usage
        if chunk.model:
            self.model = chunk.model

    def build(self) -> LLMResponse:
        content = "".join(self._content) or None
        tool_calls: list[ToolCall] = []
        for index in sorted(self._tool_calls):
            entry = self._tool_calls[index]
            raw = "".join(entry["arguments"]) or None
            name = entry["name"] or ""
            if not name:
                continue
            tool_calls.append(
                ToolCall(
                    id=entry["id"] or "",
                    name=name,
                    arguments=parse_tool_arguments(raw),
                    raw_arguments=raw,
                )
            )
        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            finish_reason=self.finish_reason,
            usage=self.usage,
            model=self.model,
        )


class BaseLLMProvider(ABC):
    """Interface única entre orquestrador e qualquer fornecedor de LLM.

    O orquestrador só enxerga esta classe: trocar OpenAI / SESAPI / Ollama /
    vLLM não altera orquestrador, tools, políticas nem frontend.
    """

    name: str = "base"

    def __init__(self, *, model: str) -> None:
        self.model = model

    @abstractmethod
    async def chat(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> LLMResponse:
        """Um turno completo (sem streaming)."""

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[LLMChunk]:
        """Streaming de um turno.

        Implementação default: degrada para ``chat()`` emitindo um único
        chunk — providers sem suporte a streaming continuam funcionando.
        """
        response = await self.chat(messages, tools)
        if response.content:
            yield LLMChunk(content_delta=response.content)
        for index, tool_call in enumerate(response.tool_calls):
            yield LLMChunk(
                tool_call_delta=ToolCallDelta(
                    index=index,
                    id=tool_call.id,
                    name=tool_call.name,
                    arguments_delta=dump_tool_arguments(tool_call.arguments),
                )
            )
        yield LLMChunk(
            finish_reason=response.finish_reason,
            usage=response.usage,
            model=response.model or self.model,
        )

    async def close(self) -> None:
        """Libera recursos (opcional)."""
