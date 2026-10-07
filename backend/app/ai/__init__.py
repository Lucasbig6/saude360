"""Camada de IA do SIGDATA.

Fundação de agentes própria, desacoplada (sem LangChain/LangGraph):

- ``providers``  — abstração de LLM (provider trocável por configuração);
- ``tools``      — registry de ferramentas controladas (única porta de saída);
- ``policies``   — política de segurança por tipo de agente;
- ``orchestrator`` — loop genérico de tool-calling;
- ``streaming``  — eventos SSE normalizados;
- ``service``    — persistência de sessões/mensagens/tool calls;
- ``audit``      — escrita de auditoria reutilizando ``audit_logs``.

O orquestrador NUNCA executa SQL nem chama o Superset diretamente: toda
capacidade analítica passa pelas tools registradas, que reutilizam as
funções já existentes em ``app.superset`` / ``app.api``.
"""
