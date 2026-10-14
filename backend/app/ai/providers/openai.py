from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
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

# Erros transitórios: rate limit (429) e falhas momentâneas do provider.
# Sem retry o turno inteiro morre na primeira janela de cota atingida.
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 529})
# Ex.: Groq devolve "Please try again in 37.64s" — respeitar a janela do
# provedor evita queimar tentativas, mas com teto para não travar o turno.
RETRY_MAX_DELAY_SECONDS = 45.0
RETRY_TOTAL_BUDGET_SECONDS = 75.0
_RETRY_AFTER_HINT_RE = re.compile(
    r"try again in ([0-9]+(?:\.[0-9]+)?)s", re.IGNORECASE
)


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
        retry_max_attempts: int = 4,
        retry_sleep: Callable[[float], Awaitable[None]] | None = None,
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
        self._retry_max_attempts = max(1, retry_max_attempts)
        self._sleep = retry_sleep or asyncio.sleep
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
    # Retry de erros transitórios (429/5xx)
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_retry_hint(headers: httpx.Headers, body: bytes) -> float | None:
        """Espera sugerida pelo provider: header ``Retry-After`` ou o aviso
        do Groq no corpo (``Please try again in 1.68s``)."""
        raw = headers.get("retry-after")
        if raw:
            try:
                return max(float(raw), 0.0)
            except ValueError:
                pass
        text = body.decode("utf-8", errors="replace")
        match = _RETRY_AFTER_HINT_RE.search(text)
        if match:
            return max(float(match.group(1)), 0.0)
        return None

    def _retry_delay(
        self,
        status_code: int,
        headers: httpx.Headers,
        body: bytes,
        attempt: int,
        elapsed: float,
    ) -> float | None:
        """Espera até a próxima tentativa ou ``None`` para falhar de vez.

        Backoff exponencial (2s, 4s, 8s...) quando o provider não dá pista;
        com pista, obedece-a (limitada) respeitando o orçamento total para
        não segurar o turno do usuário por minutos.
        """
        if status_code not in RETRYABLE_STATUS_CODES:
            return None
        if attempt >= self._retry_max_attempts:
            return None
        hint = self._parse_retry_hint(headers, body)
        delay = (
            hint if hint is not None else float(min(2**attempt, 15))
        )
        delay = min(delay, RETRY_MAX_DELAY_SECONDS)
        if elapsed + delay > RETRY_TOTAL_BUDGET_SECONDS:
            return None
        return delay

    def _log_retry(
        self, status_code: int, attempt: int, delay: float
    ) -> None:
        logger.warning(
            "Provider '%s' retornou HTTP %s (tentativa %s/%s); "
            "aguardando %.1fs antes de tentar de novo.",
            self.name,
            status_code,
            attempt,
            self._retry_max_attempts,
            delay,
        )

    # ------------------------------------------------------------------
    # Chamadas
    # ------------------------------------------------------------------

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        attempt = 0
        elapsed = 0.0
        while True:
            attempt += 1
            try:
                response = await self._client.post(
                    "chat/completions", json=payload
                )
            except httpx.TimeoutException as exc:
                raise ProviderError(
                    f"Provider '{self.name}' excedeu o tempo limite."
                ) from exc
            except httpx.HTTPError as exc:
                raise ProviderError(
                    f"Falha de conexão com o provider '{self.name}'."
                ) from exc
            if response.status_code >= 400:
                delay = self._retry_delay(
                    response.status_code,
                    response.headers,
                    response.content,
                    attempt,
                    elapsed,
                )
                if delay is None:
                    raise ProviderError(
                        self._error_message(
                            response.status_code, response.content
                        )
                    )
                self._log_retry(response.status_code, attempt, delay)
                await self._sleep(delay)
                elapsed += delay
                continue
            break
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
        attempt = 0
        elapsed = 0.0
        while True:
            attempt += 1
            delay: float | None = None
            try:
                async with self._client.stream(
                    "POST", "chat/completions", json=payload
                ) as response:
                    if response.status_code >= 400:
                        body = await response.aread()
                        delay = self._retry_delay(
                            response.status_code,
                            response.headers,
                            body,
                            attempt,
                            elapsed,
                        )
                        if delay is None:
                            raise ProviderError(
                                self._error_message(
                                    response.status_code, body
                                )
                            )
                        self._log_retry(
                            response.status_code, attempt, delay
                        )
                    else:
                        # Sucesso: só aqui tokens são cedidos ao chamador —
                        # um 429 sempre chega antes de qualquer yield, então
                        # o retry nunca duplica conteúdo no stream.
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
                        break
            except httpx.TimeoutException as exc:
                raise ProviderError(
                    f"Provider '{self.name}' excedeu o tempo limite."
                ) from exc
            except httpx.HTTPError as exc:
                raise ProviderError(
                    f"Falha de conexão com o provider '{self.name}'."
                ) from exc
            if delay is None:
                break
            # Retry agendado pelo status HTTP (fora do contexto do stream).
            await self._sleep(delay)
            elapsed += delay

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
