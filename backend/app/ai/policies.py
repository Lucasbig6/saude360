from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace

from app.ai.schemas import AGENT_TYPES
from app.core.config import settings


class ToolPolicyError(Exception):
    """Violação de política de segurança de uma tool (negada, não é erro de sistema)."""


@dataclass(frozen=True)
class Scope:
    """Escopo autenticado da sessão — imposto pelo backend, nunca pela LLM.

    ``database_id``/``dataset_id`` vindos de arguments de tool call são
    apenas *pedidos*: só valem se pertencerem a estes conjuntos.
    """

    dashboard_id: uuid.UUID | None = None
    dataset_ids: frozenset[int] = field(default_factory=frozenset)
    database_ids: frozenset[int] = field(default_factory=frozenset)


@dataclass(frozen=True)
class AgentPolicy:
    """Política central de um tipo de agente."""

    agent_type: str
    allowed_tools: frozenset[str]
    confirmation_tools: frozenset[str] = frozenset()
    max_steps: int = 8
    max_tool_calls: int = 12
    max_rows: int = 500
    tool_timeout: float = 60.0
    scope: Scope = field(default_factory=Scope)

    def allows(self, tool_name: str) -> bool:
        return tool_name in self.allowed_tools

    def requires_confirmation(self, tool_name: str, *, spec_confirms: bool) -> bool:
        return spec_confirms or tool_name in self.confirmation_tools

    def enforce_dataset(self, requested: int | None) -> int:
        return self._resolve(
            requested,
            self.scope.dataset_ids,
            "dataset",
        )

    def enforce_database(self, requested: int | None) -> int:
        return self._resolve(
            requested,
            self.scope.database_ids,
            "database",
        )

    @staticmethod
    def _resolve(requested: int | None, allowed: frozenset[int], label: str) -> int:
        if not allowed:
            raise ToolPolicyError(
                f"Escopo de {label} não definido para esta sessão."
            )
        if requested is None:
            if len(allowed) == 1:
                return next(iter(allowed))
            raise ToolPolicyError(
                f"{label}_id não informado; escopo da sessão permite: "
                f"{sorted(allowed)}."
            )
        if requested not in allowed:
            raise ToolPolicyError(
                f"{label}_id {requested} está fora do escopo desta sessão."
            )
        return requested


def _base_policy(agent_type: str) -> AgentPolicy:
    return AgentPolicy(
        agent_type=agent_type,
        allowed_tools=frozenset(),
        max_rows=settings.ai_max_rows,
        tool_timeout=settings.ai_tool_timeout,
    )


def _copilot_policy() -> AgentPolicy:
    policy = _base_policy("dashboard_copilot")
    return replace(
        policy,
        allowed_tools=frozenset(
            {
                "get_dashboard_context",
                "get_dataset_schema",
                "get_column_values",
                "execute_query",
            }
        ),
        confirmation_tools=frozenset(),
        max_steps=settings.ai_max_steps,
    )


def _explorer_policy() -> AgentPolicy:
    policy = _base_policy("explorer")
    return replace(
        policy,
        allowed_tools=frozenset(
            {
                "get_dataset_schema",
                "get_column_values",
                "execute_query",
                "create_analysis",
            }
        ),
        confirmation_tools=frozenset({"create_analysis"}),
        max_steps=settings.ai_max_steps,
    )


#: Templates por tipo de agente (escopo é aplicado depois, por sessão).
AGENT_POLICIES: dict[str, AgentPolicy] = {
    "dashboard_copilot": _copilot_policy(),
    "explorer": _explorer_policy(),
}


def build_policy(
    agent_type: str,
    scope: Scope,
    *,
    max_rows: int | None = None,
    tool_timeout: float | None = None,
) -> AgentPolicy:
    """Monta a política efetiva de um turno (template + escopo da sessão)."""
    if agent_type not in AGENT_TYPES:
        raise ToolPolicyError(f"Tipo de agente desconhecido: '{agent_type}'.")
    template = AGENT_POLICIES[agent_type]
    return replace(
        template,
        scope=scope,
        max_rows=max_rows if max_rows is not None else template.max_rows,
        tool_timeout=tool_timeout if tool_timeout is not None else template.tool_timeout,
    )
