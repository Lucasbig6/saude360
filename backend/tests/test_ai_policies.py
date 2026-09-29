from __future__ import annotations

import uuid

import pytest

from app.ai.policies import (
    AGENT_POLICIES,
    Scope,
    ToolPolicyError,
    build_policy,
)
from app.ai.tools import build_registry
from app.ai.tools.registry import ToolContext, ToolNotAllowedError, ToolSpec

# ---------------------------------------------------------------------------
# Políticas por agente
# ---------------------------------------------------------------------------


def test_copilot_cannot_write():
    policy = AGENT_POLICIES["dashboard_copilot"]
    assert policy.allows("get_dashboard_context")
    assert policy.allows("execute_query")
    assert not policy.allows("create_analysis")
    assert policy.confirmation_tools == frozenset()


def test_explorer_can_write_only_with_confirmation():
    policy = AGENT_POLICIES["explorer"]
    assert policy.allows("create_analysis")
    assert policy.requires_confirmation("create_analysis", spec_confirms=False)
    assert not policy.requires_confirmation("execute_query", spec_confirms=False)


def test_every_agent_type_has_a_policy():
    for agent_type in ("dashboard_copilot", "explorer"):
        assert agent_type in AGENT_POLICIES


def test_unknown_agent_type_is_rejected():
    with pytest.raises(ToolPolicyError):
        build_policy("agente_malicioso", Scope())


def test_policy_limits_come_from_settings():
    policy = build_policy("dashboard_copilot", Scope())
    assert policy.max_steps >= 1
    assert policy.max_rows >= 1
    assert policy.tool_timeout > 0


# ---------------------------------------------------------------------------
# Escopo (database_id/dataset_id nunca confiáveis vindos do LLM)
# ---------------------------------------------------------------------------


def test_enforce_dataset_without_scope_is_denied():
    policy = build_policy("explorer", Scope())
    with pytest.raises(ToolPolicyError):
        policy.enforce_dataset(None)


def test_enforce_dataset_single_scope_resolves_implicitly():
    policy = build_policy("explorer", Scope(dataset_ids=frozenset({42})))
    assert policy.enforce_dataset(None) == 42
    assert policy.enforce_dataset(42) == 42


def test_enforce_dataset_out_of_scope_is_denied():
    policy = build_policy("explorer", Scope(dataset_ids=frozenset({42})))
    with pytest.raises(ToolPolicyError):
        policy.enforce_dataset(99)


def test_enforce_dataset_multiple_requires_explicit_id():
    policy = build_policy("explorer", Scope(dataset_ids=frozenset({1, 2})))
    with pytest.raises(ToolPolicyError):
        policy.enforce_dataset(None)
    assert policy.enforce_dataset(2) == 2


def test_enforce_database_out_of_scope_is_denied():
    policy = build_policy("dashboard_copilot", Scope(database_ids=frozenset({7})))
    with pytest.raises(ToolPolicyError):
        policy.enforce_database(8)


def test_scope_carries_dashboard_id():
    dashboard_id = uuid.uuid4()
    scope = Scope(dashboard_id=dashboard_id)
    policy = build_policy("dashboard_copilot", scope)
    assert policy.scope.dashboard_id == dashboard_id


# ---------------------------------------------------------------------------
# Registry (dupla barreira)
# ---------------------------------------------------------------------------


def test_registry_builds_expected_tools():
    registry = build_registry()
    names = {spec.name for spec in registry.all()}
    assert names == {
        "get_dashboard_context",
        "get_dataset_schema",
        "get_column_values",
        "execute_query",
        "create_analysis",
    }


def test_registry_exposes_only_policy_allowed_tools_to_provider():
    registry = build_registry()
    copilot = build_policy("dashboard_copilot", Scope())
    explorer = build_policy("explorer", Scope())

    copilot_tools = {tool["function"]["name"] for tool in registry.provider_specs(copilot)}
    explorer_tools = {tool["function"]["name"] for tool in registry.provider_specs(explorer)}

    assert "create_analysis" not in copilot_tools
    assert "create_analysis" in explorer_tools
    assert "get_dashboard_context" not in explorer_tools


def test_registry_resolve_denies_policy_violation():
    registry = build_registry()
    copilot = build_policy("dashboard_copilot", Scope())
    with pytest.raises(ToolNotAllowedError):
        registry.resolve("create_analysis", copilot)


def test_registry_resolve_denies_unknown_tool():
    registry = build_registry()
    copilot = build_policy("dashboard_copilot", Scope())
    with pytest.raises(ToolNotAllowedError):
        registry.resolve("executar_arquivo_qualquer", copilot)


def test_registry_resolve_denies_agent_restricted_spec():
    policy = AGENT_POLICIES["dashboard_copilot"]
    spec = ToolSpec(
        name="so_explorer",
        description="",
        input_schema={},
        handler=None,  # type: ignore[arg-type]
        allowed_agents=frozenset({"explorer"}),
    )
    assert not spec.is_allowed_for(policy.agent_type)


def test_duplicate_registration_is_rejected():
    from app.ai.tools import ToolRegistry

    registry = ToolRegistry()
    spec = ToolSpec(
        name="x",
        description="",
        input_schema={},
        handler=None,  # type: ignore[arg-type]
    )
    registry.register(spec)
    with pytest.raises(ValueError):
        registry.register(spec)


def test_provider_spec_shape_is_openai_function_calling():
    registry = build_registry()
    policy = build_policy("explorer", Scope())
    specs = registry.provider_specs(policy)
    assert specs
    for spec in specs:
        assert spec["type"] == "function"
        assert "name" in spec["function"]
        assert "parameters" in spec["function"]
        assert spec["function"]["parameters"]["type"] == "object"


def test_tool_context_carries_policy():
    policy = build_policy("explorer", Scope(dataset_ids=frozenset({1})))
    context = ToolContext(agent_type="explorer", policy=policy)
    assert context.policy.enforce_dataset(None) == 1
