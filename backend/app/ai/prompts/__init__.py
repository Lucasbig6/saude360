from __future__ import annotations

from app.ai.prompts.copilot import SYSTEM_PROMPT as COPILOT_SYSTEM_PROMPT
from app.ai.prompts.explorer import SYSTEM_PROMPT as EXPLORER_SYSTEM_PROMPT
from app.ai.schemas import AGENT_TYPES

SYSTEM_PROMPTS: dict[str, str] = {
    "dashboard_copilot": COPILOT_SYSTEM_PROMPT,
    "explorer": EXPLORER_SYSTEM_PROMPT,
}


def get_system_prompt(agent_type: str) -> str:
    if agent_type not in AGENT_TYPES:
        raise ValueError(f"Tipo de agente desconhecido: '{agent_type}'")
    return SYSTEM_PROMPTS[agent_type]
