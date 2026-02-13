"""Tests for app/services/agent_service.py."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.models.agent import AgentMessage, ChatResponse
from app.models.media import MediaItem
from app.services.agent_service import PlexAgentService


@pytest.fixture
def agent_settings():
    return Settings(
        session_secret_key="test-secret",
        openai_api_key="test-key",
        llm_model="gpt-4o-mini",
    )


@pytest.fixture
def agent_service(agent_settings, mock_cache):
    svc = PlexAgentService(
        plex_token="test-token",
        settings=agent_settings,
        server_name="TestServer",
        cache=mock_cache,
    )
    # Clear class-level conversation storage between tests
    PlexAgentService._conversations.clear()
    return svc


class TestPlexClientProperty:
    def test_lazy_creation(self, agent_service):
        assert agent_service._plex_client is None
        with patch("app.services.agent_service.PlexClientService") as mock_cls:
            mock_cls.return_value = MagicMock()
            client = agent_service.plex_client
            mock_cls.assert_called_once()

    def test_reuse(self, agent_service):
        mock_client = MagicMock()
        agent_service._plex_client = mock_client
        assert agent_service.plex_client is mock_client


class TestGetLLM:
    def test_lazy_creation(self, agent_service):
        assert agent_service._llm is None
        with patch("app.services.agent_service.ChatOpenAI") as mock_cls:
            mock_cls.return_value = MagicMock()
            llm = agent_service._get_llm()
            mock_cls.assert_called_once()

    def test_reuse(self, agent_service):
        mock_llm = MagicMock()
        agent_service._llm = mock_llm
        assert agent_service._get_llm() is mock_llm


class TestChat:
    def _setup_llm_no_tools(self, agent_service, response_content="Hello!"):
        mock_response = MagicMock()
        mock_response.tool_calls = []
        mock_response.content = response_content
        mock_response.__class__ = type("AIMessage", (), {})

        mock_llm = MagicMock()
        mock_llm_with_tools = MagicMock()
        mock_llm_with_tools.invoke.return_value = mock_response
        mock_llm.bind_tools.return_value = mock_llm_with_tools

        agent_service._llm = mock_llm
        return mock_response

    def test_new_conversation_generates_id(self, agent_service):
        from langchain_core.messages import AIMessage

        mock_response = MagicMock(spec=AIMessage)
        mock_response.tool_calls = []
        mock_response.content = "Hello!"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = mock_response
        agent_service._llm = mock_llm

        with patch("app.services.agent_service.create_plex_tools", return_value=[]):
            result = agent_service.chat("Hi")

        assert result.conversation_id is not None
        assert len(result.conversation_id) > 0

    def test_existing_conversation(self, agent_service):
        from langchain_core.messages import AIMessage, SystemMessage

        PlexAgentService._conversations["existing-id"] = [SystemMessage(content="system")]

        mock_response = MagicMock(spec=AIMessage)
        mock_response.tool_calls = []
        mock_response.content = "Continuing..."

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = mock_response
        agent_service._llm = mock_llm

        with patch("app.services.agent_service.create_plex_tools", return_value=[]):
            result = agent_service.chat("Continue", conversation_id="existing-id")

        assert result.conversation_id == "existing-id"

    def test_no_tool_calls(self, agent_service):
        from langchain_core.messages import AIMessage

        mock_response = MagicMock(spec=AIMessage)
        mock_response.tool_calls = []
        mock_response.content = "Just a text response"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = mock_response
        agent_service._llm = mock_llm

        with patch("app.services.agent_service.create_plex_tools", return_value=[]):
            result = agent_service.chat("Hello")

        assert result.message.content == "Just a text response"
        assert result.message.media_items == []

    def test_tool_call_with_media_items(self, agent_service):
        from langchain_core.messages import AIMessage

        # First call: tool call
        tool_call_response = MagicMock(spec=AIMessage)
        tool_call_response.tool_calls = [
            {"name": "search_library", "args": {"query": "inception"}, "id": "call_1"}
        ]
        tool_call_response.content = ""

        # Second call: final response
        final_response = MagicMock(spec=AIMessage)
        final_response.tool_calls = []
        final_response.content = "I found Inception in your library!"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_response, final_response]
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "search_library"
        mock_tool.invoke.return_value = [
            {"rating_key": "1", "guid": "plex://movie/1", "title": "Inception", "type": "movie"}
        ]

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            result = agent_service.chat("Find Inception")

        assert len(result.message.media_items) == 1
        assert result.message.media_items[0].title == "Inception"

    def test_media_items_filtered_by_response_text(self, agent_service):
        from langchain_core.messages import AIMessage

        tool_call_response = MagicMock(spec=AIMessage)
        tool_call_response.tool_calls = [
            {"name": "search_library", "args": {}, "id": "call_1"}
        ]
        tool_call_response.content = ""

        final_response = MagicMock(spec=AIMessage)
        final_response.tool_calls = []
        final_response.content = "Here is Inception for you!"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_response, final_response]
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "search_library"
        mock_tool.invoke.return_value = [
            {"rating_key": "1", "guid": "plex://movie/1", "title": "Inception", "type": "movie"},
            {"rating_key": "2", "guid": "plex://movie/2", "title": "Matrix", "type": "movie"},
        ]

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            result = agent_service.chat("Find something")

        # Only Inception should be included since "Matrix" is not in the response text
        assert len(result.message.media_items) == 1
        assert result.message.media_items[0].title == "Inception"

    def test_dict_tool_result(self, agent_service):
        from langchain_core.messages import AIMessage

        tool_call_response = MagicMock(spec=AIMessage)
        tool_call_response.tool_calls = [
            {"name": "get_media_details", "args": {"title": "Inception"}, "id": "call_1"}
        ]
        tool_call_response.content = ""

        final_response = MagicMock(spec=AIMessage)
        final_response.tool_calls = []
        final_response.content = "Inception is a great movie!"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_response, final_response]
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "get_media_details"
        mock_tool.invoke.return_value = {
            "rating_key": "1", "guid": "plex://movie/1", "title": "Inception", "type": "movie"
        }

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            result = agent_service.chat("Details for Inception")

        assert len(result.message.media_items) == 1

    def test_max_iterations(self, agent_service):
        from langchain_core.messages import AIMessage

        # Create response that always has tool calls (to test max iterations)
        tool_response = MagicMock(spec=AIMessage)
        tool_response.tool_calls = [
            {"name": "search_library", "args": {}, "id": "call_1"}
        ]
        tool_response.content = "Max iterations reached"

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = tool_response
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "search_library"
        mock_tool.invoke.return_value = []

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            result = agent_service.chat("Loop forever")

        # Should stop after 5 iterations
        assert mock_llm.bind_tools.return_value.invoke.call_count == 5


class TestChatStream:
    def test_yields_correct_event_types(self, agent_service):
        from langchain_core.messages import AIMessage

        # Setup: no tool calls, direct to streaming
        no_tool_response = MagicMock(spec=AIMessage)
        no_tool_response.tool_calls = []
        no_tool_response.content = ""

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.return_value = no_tool_response
        agent_service._llm = mock_llm

        # Streaming LLM mock
        chunk1 = MagicMock()
        chunk1.content = "Hello "
        chunk2 = MagicMock()
        chunk2.content = "World"

        with patch("app.services.agent_service.create_plex_tools", return_value=[]):
            with patch("app.services.agent_service.ChatOpenAI") as mock_streaming:
                streaming_instance = MagicMock()
                streaming_instance.bind_tools.return_value.stream.return_value = [chunk1, chunk2]
                mock_streaming.return_value = streaming_instance

                events = list(agent_service.chat_stream("Hello"))

        # Parse events
        event_types = []
        for event in events:
            data = json.loads(event.replace("data: ", "").strip())
            event_types.append(data["type"])

        assert "conversation_id" in event_types
        assert "content" in event_types
        assert "done" in event_types

    def test_tool_call_events(self, agent_service):
        from langchain_core.messages import AIMessage

        tool_call_response = MagicMock(spec=AIMessage)
        tool_call_response.tool_calls = [
            {"name": "search_library", "args": {}, "id": "call_1"}
        ]
        tool_call_response.content = ""

        no_tool_response = MagicMock(spec=AIMessage)
        no_tool_response.tool_calls = []
        no_tool_response.content = ""

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_response, no_tool_response]
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "search_library"
        mock_tool.invoke.return_value = []

        chunk = MagicMock()
        chunk.content = "Done"

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            with patch("app.services.agent_service.ChatOpenAI") as mock_streaming:
                streaming_instance = MagicMock()
                streaming_instance.bind_tools.return_value.stream.return_value = [chunk]
                mock_streaming.return_value = streaming_instance

                events = list(agent_service.chat_stream("Search"))

        event_types = []
        for event in events:
            data = json.loads(event.replace("data: ", "").strip())
            event_types.append(data["type"])

        assert "tool_call" in event_types

    def test_media_items_event(self, agent_service):
        from langchain_core.messages import AIMessage

        tool_call_response = MagicMock(spec=AIMessage)
        tool_call_response.tool_calls = [
            {"name": "search_library", "args": {}, "id": "call_1"}
        ]
        tool_call_response.content = ""

        no_tool_response = MagicMock(spec=AIMessage)
        no_tool_response.tool_calls = []
        no_tool_response.content = ""

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_response, no_tool_response]
        agent_service._llm = mock_llm

        mock_tool = MagicMock()
        mock_tool.name = "search_library"
        mock_tool.invoke.return_value = [
            {"rating_key": "1", "guid": "plex://movie/1", "title": "Inception", "type": "movie"}
        ]

        chunk = MagicMock()
        chunk.content = "Found Inception!"

        with patch("app.services.agent_service.create_plex_tools", return_value=[mock_tool]):
            with patch("app.services.agent_service.ChatOpenAI") as mock_streaming:
                streaming_instance = MagicMock()
                streaming_instance.bind_tools.return_value.stream.return_value = [chunk]
                mock_streaming.return_value = streaming_instance

                events = list(agent_service.chat_stream("Find Inception"))

        event_types = []
        for event in events:
            data = json.loads(event.replace("data: ", "").strip())
            event_types.append(data["type"])

        assert "media_items" in event_types


class TestClearConversation:
    def test_existing_conversation(self, agent_service):
        PlexAgentService._conversations["conv-123"] = [MagicMock()]
        assert agent_service.clear_conversation("conv-123") is True
        assert "conv-123" not in PlexAgentService._conversations

    def test_missing_conversation(self, agent_service):
        assert agent_service.clear_conversation("nonexistent") is False
