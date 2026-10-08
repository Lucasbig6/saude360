from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Mapping
from typing import Any

import httpx

from app.ai.providers.base import (
    BaseLLMProvider,
    ChatMessage,
    LLMChunk,
    LLMResponse,
    LLMUsage,
    ProviderError,
    ProviderNotConfiguredError,
    ResponseAccumulator,
    ToolCall,
    ToolCallDelta,
    parse_tool_arguments,
)

logger = logging.getLogger(__name__)

DONE_SENTINEL = "[DONE]"


class OpenAICompatibleProvider(BaseLLMProvider):
    """Provider para APIs no padrão ``POST {base_url}/chat/completions``.

    Cobre OpenAI, OpenRouter, Ollama, vLLM e qualquer outro serviço
    compatível — basta ``AI_BASE_URL``/``AI_MODEL``. Toda diferença de API
    fica restrita a este arquivo.

    Segredos: a API key vai apenas no header de autenticação do httpx e
    nunca aparece em mensagens de erro ou logs.
    """

    name = "openai"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 60.0,
        extra_headers: Mapping[str, str] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(model=model)
        if not (base_url or "").strip():
            raise ProviderNotConfiguredError(
                "AI_BASE_URL não configurado (ex.: https://api.openai.com/v1)."
            )
        if not (model or "").strip():
            raise ProviderNotConfiguredError("AI_MODEL não configurado.")
        self._base_url = base_url.rstrip("/") + "/"
        self._api_key = api_key or None
        headers: dict[str, str] = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        headers.update(dict(extra_headers or {}))
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            headers=headers,
            transport=transport,
        )

    # ------------------------------------------------------------------
    # Normalização de mensagens / respostas
    # ------------------------------------------------------------------

    def _message_payload(self, message: ChatMessage) -> dict[str, Any]:
        if message.role == "assistant":
            payload: dict[str, Any] = {"role": "assistant", "content": message.content}
            if message.tool_calls:
                payload["tool_calls"] = [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.name,
                            "arguments": json.dumps(
                                tool_call.arguments, ensure_ascii=False, default=str
                            ),
                        },
                    }
                    for tool_call in message.tool_calls
                ]
            return payload
        if message.role == "tool":
            return {
                "role": "tool",
                "tool_call_id": message.tool_call_id,
                "content": message.content or "",
            }
        return {"role": message.role, "content": message.content or ""}

    def _request_payload(
        self, messages: list[ChatMessage], tools: list[dict[str, Any]], stream: bool
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [self._message_payload(message) for message in messages],
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if stream:
            # Alguns providers expõem o uso de tokens mesmo em streaming.
            payload["stream_options"] = {"include_usage": True}
        return payload

    @staticmethod
    def _parse_tool_calls(message: dict[str, Any]) -> list[ToolCall]:
        tool_calls: list[ToolCall] = []
        for index, raw in enumerate(message.get("tool_calls") or []):
            if not isinstance(raw, dict):
                continue
            function = raw.get("function") or {}
            name = function.get("name") or ""
            if not name:
                continue
            raw_arguments = function.get("arguments")
            tool_calls.append(
                ToolCall(
                    id=raw.get("id") or f"call_{index}",
                    name=name,
                    arguments=parse_tool_arguments(raw_arguments),
                    raw_arguments=raw_arguments
                    if isinstance(raw_arguments, str)
                    else None,
                )
            )
        return tool_calls

    def _error_message(self, status_code: int, body: bytes) -> str:
        text = body.decode("utf-8", errors="replace")[:500]
        text = self._sanitize(text)
        return f"Provider '{self.name}' retornou HTTP {status_code}: {text}"

    def _sanitize(self, text: str) -> str:
        """Remove segredos de qualquer mensagem de erro/log."""
        if self._api_key:
            text = text.replace(self._api_key, "***")
        return text

    # ------------------------------------------------------------------
    # Chamadas
    # ------------------------------------------------------------------

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._client.post("chat/completions", json=payload)
        except httpx.TimeoutException as exc:
            raise ProviderError(f"Provider '{self.name}' excedeu o tempo limite.") from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Falha de conexão com o provider '{self.name}'."
            ) from exc
        if response.status_code >= 400:
            raise ProviderError(
                self._error_message(response.status_code, response.content)
            )
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise ProviderError(
                f"Provider '{self.name}' retornou JSON inválido."
            ) from exc

    async def chat(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> LLMResponse:
        data = await self._post(self._request_payload(messages, tools, stream=False))
        if isinstance(data, dict) and isinstance(data.get("error"), dict):
            detail = data["error"].get("message") or "erro desconhecido do provider"
            raise ProviderError(
                f"Provider '{self.name}' rejeitou a requisição: "
                f"{self._sanitize(str(detail))[:500]}"
            )
        choices = data.get("choices") or []
        if not choices:
            raise ProviderError(f"Provider '{self.name}' não retornou choices.")
        choice = choices[0] if isinstance(choices[0], dict) else {}
        message = choice.get("message") or {}
        return LLMResponse(
            content=message.get("content"),
            tool_calls=self._parse_tool_calls(message),
            finish_reason=choice.get("finish_reason"),
            usage=LLMUsage.from_payload(data.get("usage")),
            model=data.get("model") or self.model,
        )

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[LLMChunk]:
        payload = self._request_payload(messages, tools, stream=True)
        accumulator = ResponseAccumulator()
        try:
            async with self._client.stream(
                "POST", "chat/completions", json=payload
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise ProviderError(
                        self._error_message(response.status_code, body)
                    )
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if data == DONE_SENTINEL:
                        break
                    chunk = self._parse_stream_chunk(data)
                    if chunk is None:
                        continue
                    accumulator.add(chunk)
                    if chunk.content_delta:
                        yield LLMChunk(content_delta=chunk.content_delta)
        except httpx.TimeoutException as exc:
            raise ProviderError(f"Provider '{self.name}' excedeu o tempo limite.") from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Falha de conexão com o provider '{self.name}'."
            ) from exc

        final = accumulator.build()
        for index, tool_call in enumerate(final.tool_calls):
            yield LLMChunk(
                tool_call_delta=ToolCallDelta(
                    index=index,
                    id=tool_call.id,
                    name=tool_call.name,
                    arguments_delta=json.dumps(
                        tool_call.arguments, ensure_ascii=False, default=str
                    ),
                )
            )
        yield LLMChunk(
            finish_reason=final.finish_reason,
            usage=final.usage,
            model=final.model or self.model,
        )

    def _parse_stream_chunk(self, data: str) -> LLMChunk | None:
        try:
            payload = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            logger.debug("Chunk SSE inválido ignorado pelo provider '%s'", self.name)
            return None
        if not isinstance(payload, dict):
            return None
        # Erro embutido no stream (HTTP 200 com {"error": ...}): o Groq usa
        # esse formato quando a tool call do modelo falha na validação
        # (ex.: tool_use_failed). Sem isso o turno terminaria vazio e
        # silencioso. Levantar aqui vira evento `error` no orquestrador.
        error = payload.get("error")
        if isinstance(error, dict):
            detail = error.get("message") or "erro desconhecido do provider"
            raise ProviderError(
                f"Provider '{self.name}' rejeitou a requisição: "
                f"{self._sanitize(str(detail))[:500]}"
            )
        choices = payload.get("choices") or []
        chunk = LLMChunk(
            usage=LLMUsage.from_payload(payload.get("usage")),
            model=payload.get("model"),
        )
        if not choices:
            return chunk if (chunk.usage or chunk.model) else None
        choice = choices[0] if isinstance(choices[0], dict) else {}
        delta = choice.get("delta") or {}
        content = delta.get("content")
        if isinstance(content, str) and content:
            chunk.content_delta = content
        raw_tool_calls = delta.get("tool_calls")
        if raw_tool_calls:
            first = raw_tool_calls[0] if isinstance(raw_tool_calls[0], dict) else {}
            function = first.get("function") or {}
            chunk.tool_call_delta = ToolCallDelta(
                index=first.get("index", 0) or 0,
                id=first.get("id"),
                name=function.get("name"),
                arguments_delta=function.get("arguments"),
            )
        finish_reason = choice.get("finish_reason")
        if finish_reason:
            chunk.finish_reason = finish_reason
        if not (
            chunk.content_delta
            or chunk.tool_call_delta
            or chunk.finish_reason
            or chunk.usage
            or chunk.model
        ):
            return None
        return chunk

    async def close(self) -> None:
        await self._client.aclose()
