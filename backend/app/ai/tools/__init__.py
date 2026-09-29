from __future__ import annotations

from app.ai.tools.analyses import create_analysis_spec
from app.ai.tools.dashboard import dashboard_context_spec
from app.ai.tools.datasets import column_values_spec, dataset_schema_spec
from app.ai.tools.queries import execute_query_spec
from app.ai.tools.registry import (
    ToolContext,
    ToolNotAllowedError,
    ToolRegistry,
    ToolSpec,
)
from app.ai.tools.widgets import update_widget_config_spec


def build_registry() -> ToolRegistry:
    """Registry padrão com as tools da fundação.

    Próxima etapa (Copiloto): ``create_chart`` e ``analyze_result`` — a
    registry é o único lugar a tocar para expô-las aos agentes.
    """
    registry = ToolRegistry()
    for spec in (
        dashboard_context_spec(),
        dataset_schema_spec(),
        column_values_spec(),
        execute_query_spec(),
        create_analysis_spec(),
        update_widget_config_spec(),
    ):
        registry.register(spec)
    return registry


__all__ = [
    "ToolContext",
    "ToolNotAllowedError",
    "ToolRegistry",
    "ToolSpec",
    "build_registry",
]
