from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

from dotenv import dotenv_values

# ---------------------------------------------------------------------------
# Os testes rodam SOMENTE contra o banco de testes (saude360_test).
# Precisa acontecer antes de importar app.core.config / app.main, porque o
# engine do SQLAlchemy e o Alembic leem settings.database_url na importação.
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[1]
_TEST_URL = os.environ.get("TEST_DATABASE_URL") or dotenv_values(BACKEND_DIR / ".env").get(
    "TEST_DATABASE_URL"
)
if not _TEST_URL:
    raise RuntimeError("TEST_DATABASE_URL não definido (backend/.env)")
if "saude360_test" not in _TEST_URL:
    raise RuntimeError(f"TEST_DATABASE_URL inválido: {_TEST_URL}")
os.environ["DATABASE_URL"] = _TEST_URL

import jwt  # noqa: E402
import pytest  # noqa: E402
from alembic.config import Config as AlembicConfig  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from alembic import command as alembic_command  # noqa: E402
from app.ai.providers.base import (  # noqa: E402
    BaseLLMProvider,
    LLMChunk,
    LLMResponse,
    LLMUsage,
    ToolCall,
    ToolCallDelta,
)
from app.ai.router import get_llm_provider  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402


class FakeLLMProvider(BaseLLMProvider):
    """Provider de testes: devolve respostas roteirizadas, sem rede."""

    name = "fake"

    def __init__(self, responses: list | None = None, *, model: str = "fake-model"):
        super().__init__(model=model)
        self._responses = list(responses or [])
        self.calls: list[dict] = []

    async def chat(self, messages, tools) -> LLMResponse:
        self.calls.append({"messages": list(messages), "tools": tools})
        if not self._responses:
            return LLMResponse(content="ok", finish_reason="stop")
        item = self._responses.pop(0)
        if callable(item):
            item = item(messages, tools)
        return item

    async def chat_stream(self, messages, tools):
        response = await self.chat(messages, tools)
        if response.content:
            yield LLMChunk(content_delta=response.content)
        for index, tool_call in enumerate(response.tool_calls):
            yield LLMChunk(
                tool_call_delta=ToolCallDelta(
                    index=index,
                    id=tool_call.id,
                    name=tool_call.name,
                    arguments_delta=json.dumps(
                        tool_call.arguments, ensure_ascii=False
                    ),
                )
            )
        yield LLMChunk(
            finish_reason=response.finish_reason,
            usage=response.usage or LLMUsage(total_tokens=1),
            model=response.model or self.model,
        )


def make_llm_response(
    content: str | None = None,
    tool_calls: list | None = None,
    finish_reason: str | None = "stop",
) -> LLMResponse:
    return LLMResponse(
        content=content,
        tool_calls=tool_calls or [],
        finish_reason=finish_reason,
        usage=LLMUsage(prompt_tokens=1, completion_tokens=1, total_tokens=2),
    )


def make_tool_call(name: str, arguments: dict, call_id: str = "call_1") -> ToolCall:
    return ToolCall(id=call_id, name=name, arguments=arguments)


def make_token(**claims) -> str:
    payload = {
        "sub": "1",
        "type": "access",
        "fresh": True,
        "iat": 1790000000,
        "nbf": 1790000000,
        "exp": 4102444800,
        **claims,
    }
    return jwt.encode(payload, settings.superset_secret_key, algorithm="HS256")


@pytest.fixture
def mock_superset_client():
    """Mock SupersetClient for all tests."""
    client = AsyncMock()
    client.login = AsyncMock()
    client.close = AsyncMock()
    client.check_health = AsyncMock(return_value=True)
    client.get = AsyncMock(return_value={"count": 0, "result": []})
    client.post = AsyncMock(return_value={})
    client.put = AsyncMock(return_value={})
    client.delete = AsyncMock(return_value=AsyncMock(status_code=204))
    client.get_current_user = AsyncMock(
        return_value={"username": "admin", "first_name": "Admin", "last_name": "User"}
    )
    client.login_as = AsyncMock(
        return_value={"access_token": "test_token", "refresh_token": "test_refresh"}
    )
    client.refresh_user_token = AsyncMock(
        return_value={"access_token": "new_token", "refresh_token": "new_refresh"}
    )
    return client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Valid authorization headers."""
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture
def fake_llm_provider() -> FakeLLMProvider:
    """Provider LLM roteirizado (sem rede)."""
    return FakeLLMProvider()


@pytest.fixture
def override_llm_provider(fake_llm_provider: FakeLLMProvider):
    """Substitui o provider LLM real pelo fake durante o teste."""
    app.dependency_overrides[get_llm_provider] = lambda: fake_llm_provider
    yield fake_llm_provider
    app.dependency_overrides.pop(get_llm_provider, None)


@pytest.fixture
async def client(mock_superset_client):
    """Async test client with mocked SupersetClient."""
    patches = [
        patch("app.main.superset_client", mock_superset_client),
        patch("app.superset.client.superset_client", mock_superset_client),
        patch("app.superset.dashboards.superset_client", mock_superset_client),
        patch("app.superset.charts.superset_client", mock_superset_client),
        patch("app.superset.datasets.superset_client", mock_superset_client),
        patch("app.superset.queries.superset_client", mock_superset_client),
        patch("app.superset.sources.superset_client", mock_superset_client),
        patch("app.superset.auth.superset_client", mock_superset_client),
        patch("app.superset.materialize.superset_client", mock_superset_client),
    ]
    for p in patches:
        p.start()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    for p in patches:
        p.stop()


@pytest.fixture(scope="session")
def test_db_url() -> str:
    """Garante que os testes apontam para o banco de testes e que ele responde."""
    if "saude360_test" not in settings.database_url:
        pytest.fail(
            f"recuso rodar testes fora do banco de teste: {settings.database_url}"
        )

    engine = create_engine(settings.database_url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - depende do ambiente
        pytest.skip(
            f"PostgreSQL indisponível ({exc.__class__.__name__}) — suba com `make db-up`"
        )
    finally:
        engine.dispose()

    return settings.database_url


@pytest.fixture(scope="session")
def migrated_db(test_db_url: str) -> str:
    """Reseta o schema do banco de testes e aplica `alembic upgrade head`."""
    engine = create_engine(test_db_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()

    cfg = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    alembic_command.upgrade(cfg, "head")

    return test_db_url
