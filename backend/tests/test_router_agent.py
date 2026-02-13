"""Tests for app/routers/agent.py."""

from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.config import Settings
from app.main import app
from app.routers.agent import get_agent_deps
from app.services.cache import CacheService


@pytest.fixture
def mock_settings():
    s = MagicMock(spec=Settings)
    s.openai_api_key = "test-key"
    s.llm_model = "gpt-4o-mini"
    return s


@pytest.fixture
def mock_cache_svc():
    return MagicMock(spec=CacheService)


@pytest.fixture(autouse=True)
def _override_deps(mock_settings, mock_cache_svc):
    app.dependency_overrides[get_agent_deps] = lambda: ("test-token", mock_settings, mock_cache_svc)
    yield
    app.dependency_overrides.clear()


class TestChatEndpoint:
    async def test_missing_api_key(self, client: AsyncClient, mock_settings):
        mock_settings.openai_api_key = ""

        response = await client.post(
            "/api/agent/chat",
            json={"chat_request": {"message": "Hello", "server_name": "MyServer"}},
        )

        assert response.status_code == 503
        assert "API key" in response.json()["detail"]

    async def test_success_streaming(self, client: AsyncClient):
        with patch("app.routers.agent.PlexAgentService") as mock_agent_cls:
            mock_agent = MagicMock()
            mock_agent.chat_stream.return_value = iter([
                'data: {"type": "conversation_id", "conversation_id": "abc"}\n\n',
                'data: {"type": "content", "content": "Hello!"}\n\n',
                'data: {"type": "done"}\n\n',
            ])
            mock_agent_cls.return_value = mock_agent

            response = await client.post(
                "/api/agent/chat",
                json={"chat_request": {"message": "Hello", "server_name": "MyServer"}},
            )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    async def test_error(self, client: AsyncClient):
        with patch("app.routers.agent.PlexAgentService", side_effect=Exception("Boom")):
            response = await client.post(
                "/api/agent/chat",
                json={"chat_request": {"message": "Hello", "server_name": "MyServer"}},
            )

        assert response.status_code == 502


class TestClearConversation:
    async def test_found(self, client: AsyncClient):
        with patch("app.routers.agent.PlexAgentService") as mock_agent_cls:
            mock_agent = MagicMock()
            mock_agent.clear_conversation.return_value = True
            mock_agent_cls.return_value = mock_agent

            response = await client.delete("/api/agent/conversation/abc-123")

        assert response.status_code == 200
        assert "cleared" in response.json()["message"].lower()

    async def test_not_found(self, client: AsyncClient):
        with patch("app.routers.agent.PlexAgentService") as mock_agent_cls:
            mock_agent = MagicMock()
            mock_agent.clear_conversation.return_value = False
            mock_agent_cls.return_value = mock_agent

            response = await client.delete("/api/agent/conversation/nonexistent")

        assert response.status_code == 200
        assert "not found" in response.json()["message"].lower()
