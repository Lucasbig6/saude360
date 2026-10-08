from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.ai.policies import AgentPolicy


class ToolNotAllowedError(Exception):
    """Tool desconhecida ou não autorizada para o agente/política."""


@dataclass
class ToolContext:
    """Contexto de execução injetado nas tools (nunca exposto ao modelo)."""

    agent_type: str
    policy: AgentPolicy
    user_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    db: Session | None = None


#: Handler assíncrono: contexto + arguments (já validados pela política) → dict.
ToolHandler = Callable[[ToolContext, dict[str, Any]], Awaitable[dict[str, Any]]]


def nullable(schema: dict[str, Any]) -> dict[str, Any]:
    """Torna um parâmetro opcional aceito como ``null``.

    Motivo: o Groq valida os argumentos da tool call no servidor e rejeita
    ``null`` contra ``{"type": "integer"}`` (ou ``"string"``) com
    ``tool_use_failed`` — e o modelo frequentemente envia ``null`` para
    parâmetros opcionais que desconhece (ex.: ``dataset_id`` com um único
    dataset no escopo, resolvido pelo backend via ``Scope``). O formato
    ``anyOf`` foi verificado contra a API do Groq.
    """
    if "anyOf" in schema:
        return schema
    return {"anyOf": [schema, {"type": "null"}]}


@dataclass(frozen=True)
class ToolSpec:
    """Metadados de uma tool — a LLM só enxerga name/description/schema."""

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler
    requires_confirmation: bool = False
    allowed_agents: frozenset[str] | None = None

    def is_allowed_for(self, agent_type: str) -> bool:
        if self.allowed_agents is None:
            return True
        return agent_type in self.allowed_agents

    def to_provider_spec(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


class ToolRegistry:
    """Registro central de tools — a única porta de saída do agente.

    O LLM não pode executar funções arbitrárias do backend: apenas tools
    registradas aqui, e apenas se a política do agente as permitir.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        if spec.name in self._tools:
            raise ValueError(f"Tool já registrada: {spec.name}")
        self._tools[spec.name] = spec

    def get(self, name: str) -> ToolSpec | None:
        return self._tools.get(name)

    def all(self) -> list[ToolSpec]:
        return list(self._tools.values())

    def specs_for_agent(self, agent_type: str) -> list[ToolSpec]:
        return [spec for spec in self._tools.values() if spec.is_allowed_for(agent_type)]

    def provider_specs(self, policy: AgentPolicy) -> list[dict[str, Any]]:
        """Tools que o provider recebe no request (filtradas pela política)."""
        return [
            spec.to_provider_spec()
            for spec in self.specs_for_agent(policy.agent_type)
            if policy.allows(spec.name)
        ]

    def resolve(self, name: str, policy: AgentPolicy) -> ToolSpec:
        """Busca uma tool validando agente + política (negação em duas camadas)."""
        spec = self._tools.get(name)
        if spec is None:
            raise ToolNotAllowedError(f"Tool desconhecida: '{name}'.")
        if not spec.is_allowed_for(policy.agent_type):
            raise ToolNotAllowedError(
                f"Tool '{name}' não disponível para o agente '{policy.agent_type}'."
            )
        if not policy.allows(name):
            raise ToolNotAllowedError(
                f"Tool '{name}' não permitida pela política do agente "
                f"'{policy.agent_type}'."
            )
        return spec
