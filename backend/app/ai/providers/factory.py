from __future__ import annotations

from collections.abc import Callable

from app.ai.providers.base import BaseLLMProvider, ProviderNotConfiguredError
from app.ai.providers.openai import OpenAICompatibleProvider
from app.ai.providers.sesapi import SesapiProvider
from app.core.config import Settings

ProviderFactory = Callable[..., BaseLLMProvider]

#: Único ponto onde o nome do provider (``AI_PROVIDER``) vira implementação.
PROVIDER_TYPES: dict[str, ProviderFactory] = {
    "openai": OpenAICompatibleProvider,
    "sesapi": SesapiProvider,
}


def create_provider(cfg: Settings) -> BaseLLMProvider:
    """Cria o provider LLM definido em ``AI_PROVIDER``.

    Não existem condicionais de provider fora deste módulo: qualquer
    diferença específica de API vive no adapter correspondente.
    """
    provider_name = (cfg.ai_provider or "").strip().lower()
    if not provider_name:
        raise ProviderNotConfiguredError(
            "AI_PROVIDER não configurado. Opções: " + ", ".join(sorted(PROVIDER_TYPES))
        )
    factory = PROVIDER_TYPES.get(provider_name)
    if factory is None:
        raise ProviderNotConfiguredError(
            f"Provider desconhecido: '{provider_name}'. "
            "Opções: " + ", ".join(sorted(PROVIDER_TYPES))
        )
    return factory(
        base_url=cfg.ai_base_url,
        model=cfg.ai_model,
        api_key=cfg.ai_api_key or None,
        timeout=cfg.ai_timeout,
    )
