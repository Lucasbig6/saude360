from __future__ import annotations

import json

import httpx
import pytest

from app.ai.providers.base import (
    BaseLLMProvider,
    ChatMessage,
    LLMResponse,
    ProviderError,
    ProviderNotConfiguredError,
    ResponseAccumulator,
    ToolCall,
)
from app.ai.providers.factory import PROVIDER_TYPES, create_provider
from app.ai.providers.openai import OpenAICompatibleProvider
from app.ai.providers.sesapi import SesapiProvider
from app.core.config import Settings


def make_settings(**overrides) -> Settings:
    base = {
        "ai_provider": "openai",
        "ai_base_url": "https://llm.test/v1",
        "ai_model": "modelo-teste",
        "ai_api_key": "sk-segredo-123",
    }
    base.update(overrides)
    return Settings(**base)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def test_factory_returns_openai_provider():
    provider = create_provider(make_settings(ai_provider="openai"))
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.name == "openai"
    assert provider.model == "modelo-teste"


def test_factory_returns_sesapi_provider():
    provider = create_provider(make_settings(ai_provider="sesapi"))
    assert isinstance(provider, SesapiProvider)
    assert provider.name == "sesapi"


def test_factory_is_case_insensitive():
    provider = create_provider(make_settings(ai_provider="OpenAI"))
    assert provider.name == "openai"


def test_factory_unknown_provider_raises():
    with pytest.raises(ProviderNotConfiguredError) as exc:
        create_provider(make_settings(ai_provider="qualquer-coisa"))
    assert "qualquer-coisa" in str(exc.value)


def test_factory_without_provider_raises():
    with pytest.raises(ProviderNotConfiguredError):
        create_provider(make_settings(ai_provider=""))


def test_factory_without_base_url_raises():
    with pytest.raises(ProviderNotConfiguredError):
        create_provider(make_settings(ai_base_url=""))


def test_factory_without_model_raises():
    with pytest.raises(ProviderNotConfiguredError):
        create_provider(make_settings(ai_model=""))


def test_provider_types_registry_has_no_if_else_else():
    # Toda escolha de provider vive neste dicionário — sem condicionais espalhados.
    assert set(PROVIDER_TYPES) == {"openai", "sesapi"}


# ---------------------------------------------------------------------------
# OpenAI-compatible — chat()
# ---------------------------------------------------------------------------


def make_provider(handler, **kwargs) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url=kwargs.pop("base_url", "https://llm.test/v1"),
        model=kwargs.pop("model", "modelo-teste"),
        api_key=kwargs.pop("api_key", "sk-segredo-123"),
        transport=httpx.MockTransport(handler),
        **kwargs,
    )


async def test_chat_normalizes_content_and_usage():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        captured["authorization"] = request.headers.get("Authorization")
        return httpx.Response(
            200,
            json={
                "model": "modelo-x",
                "choices": [
                    {
                        "message": {"role": "assistant", "content": "Olá!"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            },
        )

    provider = make_provider(handler)
    response = await provider.chat([ChatMessage(role="user", content="oi")], [])

    assert response.content == "Olá!"
    assert response.finish_reason == "stop"
    assert response.tool_calls == []
    assert response.usage is not None
    assert response.usage.total_tokens == 15
    assert response.model == "modelo-x"
    assert captured["authorization"] == "Bearer sk-segredo-123"
    assert captured["body"]["model"] == "modelo-teste"
    assert captured["body"]["stream"] is False


async def test_chat_normalizes_tool_calls():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_abc",
                                    "type": "function",
                                    "function": {
                                        "name": "execute_query",
                                        "arguments": '{"sql": "SELECT 1"}',
                                    },
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ]
            },
        )

    provider = make_provider(handler)
    response = await provider.chat(
        [ChatMessage(role="user", content="oi")],
        [{"type": "function", "function": {"name": "execute_query"}}],
    )

    assert response.content is None
    assert response.finish_reason == "tool_calls"
    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].id == "call_abc"
    assert response.tool_calls[0].name == "execute_query"
    assert response.tool_calls[0].arguments == {"sql": "SELECT 1"}


async def test_chat_invalid_tool_arguments_become_empty_dict():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "tool_calls": [
                                {
                                    "id": "call_bad",
                                    "type": "function",
                                    "function": {"name": "x", "arguments": "{invalid"},
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ]
            },
        )

    provider = make_provider(handler)
    response = await provider.chat([ChatMessage(role="user", content="oi")], [])
    assert response.tool_calls[0].arguments == {}
    assert response.tool_calls[0].raw_arguments == "{invalid"


async def test_chat_http_error_raises_provider_error_without_secret():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "bad key sk-segredo-123"})

    provider = make_provider(handler)
    with pytest.raises(ProviderError) as exc:
        await provider.chat([ChatMessage(role="user", content="oi")], [])
    message = str(exc.value)
    assert "401" in message
    assert "sk-segredo-123" not in message
    assert "***" in message


async def test_chat_without_choices_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    provider = make_provider(handler)
    with pytest.raises(ProviderError):
        await provider.chat([ChatMessage(role="user", content="oi")], [])


# ---------------------------------------------------------------------------
# OpenAI-compatible — chat_stream()
# ---------------------------------------------------------------------------


def sse_lines(*payloads) -> bytes:
    parts = []
    for payload in payloads:
        parts.append(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n")
    parts.append("data: [DONE]\n\n")
    return "".join(parts).encode("utf-8")


async def test_chat_stream_accumulates_tokens_and_tool_calls():
    body = sse_lines(
        {"choices": [{"delta": {"content": "Olá "}}]},
        {"choices": [{"delta": {"content": "mundo"}}]},
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "execute_query",
                                    "arguments": '{"sql": ',
                                },
                            }
                        ]
                    },
                    "finish_reason": None,
                }
            ]
        },
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"arguments": '"SELECT 1"}'},
                            }
                        ]
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        },
        {"choices": [], "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"content-type": "text/event-stream"},
        )

    provider = make_provider(handler)
    chunks = [
        chunk
        async for chunk in provider.chat_stream(
            [ChatMessage(role="user", content="oi")],
            [{"type": "function", "function": {"name": "execute_query"}}],
        )
    ]
    text = "".join(chunk.content_delta or "" for chunk in chunks)
    assert text == "Olá mundo"
    assert any(chunk.tool_call_delta for chunk in chunks)
    assert any(chunk.finish_reason == "tool_calls" for chunk in chunks)
    assert any(chunk.usage and chunk.usage.total_tokens == 7 for chunk in chunks)


async def test_chat_stream_http_error_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"boom")

    provider = make_provider(handler)
    with pytest.raises(ProviderError):
        async for _ in provider.chat_stream([ChatMessage(role="user", content="x")], []):
            pass


async def test_chat_stream_error_payload_raises_without_secret():
    """Erro embutido no stream (HTTP 200 + {"error": ...}, ex. Groq
    tool_use_failed) vira ProviderError em vez de turno vazio silencioso."""
    body = sse_lines(
        {
            "error": {
                "message": "tool_use_failed envolvendo sk-segredo-123",
                "type": "invalid_request_error",
                "code": "tool_use_failed",
            }
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"content-type": "text/event-stream"},
        )

    provider = make_provider(handler)
    with pytest.raises(ProviderError) as exc_info:
        async for _ in provider.chat_stream([ChatMessage(role="user", content="x")], []):
            pass
    assert "sk-segredo-123" not in str(exc_info.value)
    assert "tool_use_failed" in str(exc_info.value)


async def test_chat_error_body_raises_with_detail():
    """Resposta 200 com {"error": ...} no modo sem streaming também falha."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=json.dumps(
                {"error": {"message": "model_not_found", "code": "model_not_found"}}
            ).encode(),
            headers={"content-type": "application/json"},
        )

    provider = make_provider(handler)
    with pytest.raises(ProviderError, match="model_not_found"):
        await provider.chat([ChatMessage(role="user", content="x")], [])


# ---------------------------------------------------------------------------
# Fallback de streaming (provider sem SSE)
# ---------------------------------------------------------------------------


class NoStreamProvider(BaseLLMProvider):
    name = "no-stream"

    async def chat(self, messages, tools) -> LLMResponse:
        return LLMResponse(
            content="resposta única",
            tool_calls=[ToolCall(id="c1", name="x", arguments={"a": 1})],
            finish_reason="tool_calls",
        )


async def test_base_provider_stream_fallback():
    provider = NoStreamProvider(model="m")
    chunks = [chunk async for chunk in provider.chat_stream([], [])]
    accumulator = ResponseAccumulator()
    for chunk in chunks:
        accumulator.add(chunk)
    response = accumulator.build()
    assert response.content == "resposta única"
    assert response.tool_calls[0].arguments == {"a": 1}
    assert response.finish_reason == "tool_calls"


# ---------------------------------------------------------------------------
# SESAPI
# ---------------------------------------------------------------------------


def test_sesapi_provider_uses_openai_compatible_contract():
    provider = SesapiProvider(base_url="https://ia.sesapi.test/v1", model="sesapi-x")
    assert provider.name == "sesapi"
    assert isinstance(provider, OpenAICompatibleProvider)


def test_sesapi_requires_configuration():
    with pytest.raises(ProviderNotConfiguredError):
        SesapiProvider(base_url="", model="sesapi-x")
