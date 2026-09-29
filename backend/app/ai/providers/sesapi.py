from __future__ import annotations

from app.ai.providers.openai import OpenAICompatibleProvider


class SesapiProvider(OpenAICompatibleProvider):
    """Adapter da IA da SESAPI.

    A especificação real da API da SESAPI **ainda não está documentada neste
    repositório**. Este adapter assume, provisoriamente, compatibilidade com
    a API estilo OpenAI (``POST {base_url}/chat/completions`` com tool
    calling nativo) — hipótese a confirmar com a documentação oficial.

    PENDENTE (depende da especificação real):
    - URL base e versionamento do endpoint;
    - mecanismo de autenticação (API key em header, OAuth, mTLS...);
    - formato do corpo da requisição e do envelope de resposta;
    - suporte a tool calling nativo (function calling);
    - suporte a streaming SSE;
    - nomes dos modelos, limites de contexto e rate limits;
    - política de retenção de dados institucionais.

    Se a API real divergir, **apenas este arquivo muda**: orquestrador,
    registry de tools, políticas, endpoints e frontend permanecem intactos.
    Caso a SESAPI não suporte tool calling nativo, a codificação/decodificação
    das tools deve ser resolvida aqui (ex.: serializando as tools no próprio
    prompt), sem tocar no orquestrador.
    """

    name = "sesapi"
