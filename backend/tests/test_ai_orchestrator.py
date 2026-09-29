from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest

from app.ai.orchestrator import Orchestrator
from app.ai.policies import AgentPolicy, Scope
from app.ai.prompts import get_system_prompt
from app.ai.providers.base import ChatMessage
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
)
from app.ai.tools.registry import ToolContext, ToolRegistry, ToolSpec
from tests.conftest import FakeLLMProvider, make_llm_response, make_tool_call


class MemoryRecorder:
    """Recorder em memória para testes unitários (sem banco)."""

    def __init__(self) -> None:
        self.assistants: list[dict[str, Any]] = []
        self.tools: list[dict[str, Any]] = []
        self.tool_calls: list[dict[str, Any]] = []

    async def append_assistant(self, content, tool_calls, finish_reason, usage):
        self.assistants.append(
            {
                "content": content,
                "tool_calls": tool_calls,
                "finish_reason": finish_reason,
                "usage": usage,
            }
        )
        return None

    async def append_tool(self, tool_call_id, tool_name, content, status):
        self.tools.append(
            {
                "tool_call_id": tool_call_id,
                "tool_name": tool_name,
                "content": content,
                "status": status,
            }
        )
        return None

    async def record_tool_call(self, **kwargs):
        self.tool_calls.append(kwargs)


async def ok_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return {"echo": args}


async def fail_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    raise RuntimeError("falhou de propósito")


async def slow_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    await asyncio.sleep(0.5)
    return {"late": True}


def make_spec(name="echo", handler=None, *, confirms=False, agents=None) -> ToolSpec:
    return ToolSpec(
        name=name,
        description=f"tool {name}",
        input_schema={"type": "object", "properties": {}},
        handler=handler or ok_handler,
        requires_confirmation=confirms,
        allowed_agents=agents,
    )


def make_policy(*tools: ToolSpec, **overrides) -> AgentPolicy:
    allowed = frozenset(tool.name for tool in tools)
    defaults: dict[str, Any] = {
        "agent_type": "dashboard_copilot",
        "allowed_tools": allowed,
        "max_steps": 4,
        "max_tool_calls": 4,
        "max_rows": 100,
        "tool_timeout": 1.0,
        "scope": Scope(),
    }
    defaults.update(overrides)
    return AgentPolicy(**defaults)


def make_orchestrator(provider, tools, policy, recorder=None) -> Orchestrator:
    registry = ToolRegistry()
    for tool in tools:
        registry.register(tool)
    context = ToolContext(
        agent_type=policy.agent_type, policy=policy, session_id=uuid.uuid4()
    )
    return Orchestrator(
        provider=provider,
        registry=registry,
        policy=policy,
        system_prompt=get_system_prompt(policy.agent_type),
        tool_context=context,
        recorder=recorder,
    )


async def collect(orchestrator: Orchestrator, history=None):
    return [
        event
        async for event in orchestrator.run(
            history or [ChatMessage(role="user", content="oi")]
        )
    ]


def types(events) -> list[str]:
    return [event.type for event in events]


# ---------------------------------------------------------------------------
# Resposta simples
# ---------------------------------------------------------------------------


async def test_response_without_tool_calls():
    provider = FakeLLMProvider([make_llm_response(content="Resposta final")])
    recorder = MemoryRecorder()
    orchestrator = make_orchestrator(provider, [], make_policy(), recorder)

    events = await collect(orchestrator)

    assert types(events) == [EVENT_MESSAGE_START, EVENT_TOKEN, EVENT_MESSAGE_COMPLETE]
    assert events[-1].data["content"] == "Resposta final"
    assert events[-1].data["pendingConfirmation"] is False
    assert events[0].data["provider"] == "fake"
    assert len(provider.calls) == 1
    assert recorder.assistants[0]["content"] == "Resposta final"
    # system prompt + histórico do usuário
    sent_roles = [message.role for message in provider.calls[0]["messages"]]
    assert sent_roles == ["system", "user"]


async def test_system_prompt_is_agent_specific():
    provider = FakeLLMProvider([make_llm_response(content="ok")])
    orchestrator = make_orchestrator(provider, [], make_policy())
    await collect(orchestrator)
    system = provider.calls[0]["messages"][0]
    assert system.role == "system"
    assert "Copiloto" in system.content


# ---------------------------------------------------------------------------
# Tool calling
# ---------------------------------------------------------------------------


async def test_single_tool_call_is_executed():
    spec = make_spec()
    provider = FakeLLMProvider(
        [
            make_llm_response(
                tool_calls=[make_tool_call("echo", {"x": 1}, "call_1")]
            ),
            make_llm_response(content="dados prontos"),
        ]
    )
    recorder = MemoryRecorder()
    orchestrator = make_orchestrator(provider, [spec], make_policy(spec), recorder)

    events = await collect(orchestrator)

    assert EVENT_TOOL_CALL in types(events)
    assert EVENT_TOOL_RESULT in types(events)
    assert events[-1].data["content"] == "dados prontos"
    assert len(provider.calls) == 2

    tool_event = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert tool_event.data["status"] == TOOL_STATUS_OK
    assert tool_event.data["data"] == {"echo": {"x": 1}}
    assert "durationMs" in tool_event.data

    # segunda chamada ao provider inclui a mensagem de resultado da tool
    second_roles = [message.role for message in provider.calls[1]["messages"]]
    assert second_roles == ["system", "user", "assistant", "tool"]
    assert provider.calls[1]["messages"][-1].tool_call_id == "call_1"
    assert recorder.tool_calls[0]["status"] == TOOL_STATUS_OK


async def test_multiple_tool_calls_in_one_turn():
    spec = make_spec()
    provider = FakeLLMProvider(
        [
            make_llm_response(
                tool_calls=[
                    make_tool_call("echo", {"n": 1}, "call_a"),
                    make_tool_call("echo", {"n": 2}, "call_b"),
                ]
            ),
            make_llm_response(content="pronto"),
        ]
    )
    recorder = MemoryRecorder()
    orchestrator = make_orchestrator(provider, [spec], make_policy(spec), recorder)

    events = await collect(orchestrator)

    results = [e for e in events if e.type == EVENT_TOOL_RESULT]
    assert [r.data["toolCallId"] for r in results] == ["call_a", "call_b"]
    assert all(r.data["status"] == TOOL_STATUS_OK for r in results)
    assert len(recorder.tools) == 2


async def test_tool_error_is_reported_and_loop_continues():
    spec = make_spec(name="boom", handler=fail_handler)
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("boom", {}, "call_x")]),
            make_llm_response(content="recuperei"),
        ]
    )
    orchestrator = make_orchestrator(provider, [spec], make_policy(spec))

    events = await collect(orchestrator)

    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_ERROR
    assert "falhou de propósito" in result.data["data"]["error"]
    assert events[-1].type == EVENT_MESSAGE_COMPLETE
    assert events[-1].data["content"] == "recuperei"
    assert len(provider.calls) == 2


async def test_unauthorized_tool_is_denied_and_not_executed():
    calls: list[dict] = []

    async def spy(ctx, args):
        calls.append(args)
        return {}

    policy = make_policy()  # allowed_tools vazio
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("echo", {}, "call_1")]),
            make_llm_response(content="não pude"),
        ]
    )
    orchestrator = make_orchestrator(provider, [make_spec(handler=spy)], policy)

    events = await collect(orchestrator)

    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_DENIED
    assert calls == []
    assert len(provider.calls) == 2


async def test_tool_not_registered_is_denied():
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("inexistente", {}, "c1")]),
            make_llm_response(content="ok"),
        ]
    )
    orchestrator = make_orchestrator(provider, [make_spec()], make_policy())

    events = await collect(orchestrator)
    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_DENIED
    assert "desconhecida" in result.data["data"]["error"]


async def test_tool_not_allowed_for_agent_is_denied_by_registry():
    """Dupla barreira: spec.restringe o agente E a política nega."""
    spec = make_spec(agents=frozenset({"explorer"}))
    policy = make_policy(spec)  # dashboard_copilot
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("echo", {}, "c1")]),
            make_llm_response(content="ok"),
        ]
    )
    orchestrator = make_orchestrator(provider, [spec], policy)

    events = await collect(orchestrator)
    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_DENIED


async def test_max_steps_is_enforced():
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("echo", {}, f"call_{i}")])
            for i in range(10)
        ]
    )
    policy = make_policy(make_spec(), max_steps=2)
    orchestrator = make_orchestrator(provider, [make_spec()], policy)

    events = await collect(orchestrator)

    error = next(e for e in events if e.type == EVENT_ERROR)
    assert error.data["code"] == "max_steps"
    assert len(provider.calls) == 2
    assert events[-1].type == EVENT_ERROR


async def test_tool_timeout_is_reported_as_error():
    provider = FakeLLMProvider(
        [
            make_llm_response(tool_calls=[make_tool_call("lenta", {}, "call_1")]),
            make_llm_response(content="segui"),
        ]
    )
    policy = make_policy(make_spec(name="lenta", handler=slow_handler), tool_timeout=0.05)
    orchestrator = make_orchestrator(
        provider, [make_spec(name="lenta", handler=slow_handler)], policy
    )

    events = await collect(orchestrator)
    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_ERROR
    assert "Tempo limite" in result.data["data"]["error"]


async def test_max_tool_calls_limit_denies_extra_calls():
    provider = FakeLLMProvider(
        [
            make_llm_response(
                tool_calls=[
                    make_tool_call("echo", {}, "call_a"),
                    make_tool_call("echo", {}, "call_b"),
                ]
            ),
            make_llm_response(content="fim"),
        ]
    )
    policy = make_policy(make_spec(), max_tool_calls=1)
    orchestrator = make_orchestrator(provider, [make_spec()], policy)

    events = await collect(orchestrator)
    results = [e for e in events if e.type == EVENT_TOOL_RESULT]
    assert results[0].data["status"] == TOOL_STATUS_OK
    assert results[1].data["status"] == TOOL_STATUS_DENIED
    assert "Limite" in results[1].data["data"]["error"]


async def test_provider_failure_emits_error_event():
    class BrokenProvider(FakeLLMProvider):
        async def chat_stream(self, messages, tools):
            raise RuntimeError("provider fora do ar")
            yield  # pragma: no cover

    provider = BrokenProvider()
    orchestrator = make_orchestrator(provider, [], make_policy())

    events = await collect(orchestrator)
    assert events[-1].type == EVENT_ERROR
    assert events[-1].data["code"] == "provider_error"
    # a mensagem de erro para o cliente não vaza detalhes internos
    assert "fora do ar" not in events[-1].data["message"]


# ---------------------------------------------------------------------------
# Confirmação de escrita (vinculada ao tool_call_id)
# ---------------------------------------------------------------------------


async def test_write_tool_requires_confirmation_before_executing():
    executed: list[dict] = []

    async def spy(ctx, args):
        executed.append(args)
        return {"analysisId": "abc"}

    spec = make_spec(name="create_analysis", handler=spy, confirms=True)
    provider = FakeLLMProvider(
        [
            make_llm_response(
                tool_calls=[make_tool_call("create_analysis", {"name": "X"}, "call_save")]
            )
        ]
    )
    recorder = MemoryRecorder()
    orchestrator = make_orchestrator(provider, [spec], make_policy(spec), recorder)

    events = await collect(orchestrator)

    assert executed == []
    assert EVENT_CONFIRMATION_REQUIRED in types(events)
    confirmation = next(e for e in events if e.type == EVENT_CONFIRMATION_REQUIRED)
    assert confirmation.data["toolCallId"] == "call_save"
    assert confirmation.data["name"] == "create_analysis"
    assert confirmation.data["arguments"] == {"name": "X"}

    result = next(e for e in events if e.type == EVENT_TOOL_RESULT)
    assert result.data["status"] == TOOL_STATUS_PENDING_CONFIRMATION

    complete = events[-1]
    assert complete.type == EVENT_MESSAGE_COMPLETE
    assert complete.data["pendingConfirmation"] is True
    assert complete.data["finishReason"] == "confirmation_required"

    # o turno para: o provider não é chamado de novo sem confirmação
    assert len(provider.calls) == 1
    assert recorder.tool_calls[0]["status"] == TOOL_STATUS_PENDING_CONFIRMATION
    assert recorder.tools[0]["status"] == TOOL_STATUS_PENDING_CONFIRMATION


async def test_confirmed_tool_call_is_executed_by_orchestrator():
    async def spy(ctx, args):
        return {"analysisId": "ok", "name": args.get("name")}

    spec = make_spec(name="create_analysis", handler=spy, confirms=True)
    policy = make_policy(spec)
    provider = FakeLLMProvider([make_llm_response(content="salvo!")])
    orchestrator = make_orchestrator(provider, [spec], policy)

    outcome = await orchestrator.execute(spec, {"name": "Minha análise"})
    assert outcome.status == TOOL_STATUS_OK
    assert outcome.data["analysisId"] == "ok"


async def test_policy_confirmation_tools_without_spec_flag():
    """Política pode marcar confirmação mesmo sem a spec marcar."""
    spec = make_spec(name="create_analysis", confirms=False)
    policy = make_policy(spec, confirmation_tools=frozenset({"create_analysis"}))
    provider = FakeLLMProvider(
        [make_llm_response(tool_calls=[make_tool_call("create_analysis", {}, "c1")])]
    )
    orchestrator = make_orchestrator(provider, [spec], policy)

    events = await collect(orchestrator)
    assert EVENT_CONFIRMATION_REQUIRED in types(events)


# ---------------------------------------------------------------------------
# Escopo
# ---------------------------------------------------------------------------


async def test_llm_cannot_pick_database_outside_scope():
    from app.ai.policies import ToolPolicyError
    from app.ai.tools.queries import execute_query

    policy = make_policy(
        make_spec(), scope=Scope(database_ids=frozenset({7}), dataset_ids=frozenset({3}))
    )
    context = ToolContext(agent_type=policy.agent_type, policy=policy)

    with pytest.raises(ToolPolicyError):
        await execute_query(context, {"sql": "SELECT 1", "database_id": 99})
