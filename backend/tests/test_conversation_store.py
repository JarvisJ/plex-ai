"""Tests for app/services/conversation_store.py."""

import json
from unittest.mock import MagicMock, call

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.services.conversation_store import (
    ConversationStore,
    _derive_title,
    _deserialize_message,
    _serialize_message,
)


@pytest.fixture
def mock_redis():
    r = MagicMock()
    r.hget.return_value = None
    r.hgetall.return_value = {}
    r.hset.return_value = True
    r.expire.return_value = True
    r.zadd.return_value = 1
    r.zcard.return_value = 0
    r.zrevrange.return_value = []
    r.zrange.return_value = []
    r.delete.return_value = 1
    r.zrem.return_value = 1
    r.pipeline.return_value = MagicMock()
    r.pipeline.return_value.execute.return_value = [True, True, True, True]
    return r


@pytest.fixture
def store(mock_redis):
    return ConversationStore(mock_redis)


class TestSerializeDeserialize:
    def test_human_message(self):
        msg = HumanMessage(content="hello")
        data = _serialize_message(msg)
        assert data["type"] == "human"
        assert data["content"] == "hello"
        result = _deserialize_message(data)
        assert isinstance(result, HumanMessage)
        assert result.content == "hello"

    def test_ai_message(self):
        msg = AIMessage(content="response")
        data = _serialize_message(msg)
        assert data["type"] == "ai"
        result = _deserialize_message(data)
        assert isinstance(result, AIMessage)
        assert result.content == "response"

    def test_ai_message_with_tool_calls(self):
        msg = AIMessage(content="", tool_calls=[{"name": "search", "args": {}, "id": "tc1", "type": "tool_call"}])
        data = _serialize_message(msg)
        assert data["type"] == "ai"
        assert len(data["tool_calls"]) == 1
        result = _deserialize_message(data)
        assert isinstance(result, AIMessage)
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "search"

    def test_system_message(self):
        msg = SystemMessage(content="system prompt")
        data = _serialize_message(msg)
        assert data["type"] == "system"
        result = _deserialize_message(data)
        assert isinstance(result, SystemMessage)

    def test_tool_message(self):
        msg = ToolMessage(content="result", tool_call_id="tc1")
        data = _serialize_message(msg)
        assert data["type"] == "tool"
        assert data["tool_call_id"] == "tc1"
        result = _deserialize_message(data)
        assert isinstance(result, ToolMessage)
        assert result.tool_call_id == "tc1"


class TestDeriveTitle:
    def test_from_first_human_message(self):
        messages = [
            SystemMessage(content="system"),
            HumanMessage(content="What movies do I have?"),
        ]
        assert _derive_title(messages) == "What movies do I have?"

    def test_truncates_long_messages(self):
        long_msg = "x" * 100
        messages = [HumanMessage(content=long_msg)]
        title = _derive_title(messages)
        assert len(title) == 80
        assert title.endswith("...")

    def test_no_human_message(self):
        messages = [SystemMessage(content="system")]
        assert _derive_title(messages) == "New conversation"

    def test_empty_messages(self):
        assert _derive_title([]) == "New conversation"


class TestConversationStore:
    def test_save_conversation(self, store, mock_redis):
        messages = [
            SystemMessage(content="system"),
            HumanMessage(content="hello"),
            AIMessage(content="hi there"),
        ]
        store.save_conversation(123, "conv-1", messages)

        pipe = mock_redis.pipeline.return_value
        pipe.hset.assert_called_once()
        call_args = pipe.hset.call_args
        # hset is called positionally: hset(key, mapping={...})
        key = call_args[0][0] if call_args[0] else call_args[1].get("name")
        mapping = call_args[1].get("mapping") or call_args[0][1]
        assert key == "plex:conversations:123:conv-1"
        assert mapping["title"] == "hello"
        assert "messages" in mapping

    def test_save_conversation_with_custom_title(self, store, mock_redis):
        messages = [HumanMessage(content="hello")]
        store.save_conversation(123, "conv-1", messages, title="Custom Title")

        pipe = mock_redis.pipeline.return_value
        mapping = pipe.hset.call_args[1]["mapping"]
        assert mapping["title"] == "Custom Title"

    def test_save_preserves_created_at(self, store, mock_redis):
        # Simulate existing conversation
        mock_redis.hget.return_value = "1000.0"
        messages = [HumanMessage(content="hello")]
        store.save_conversation(123, "conv-1", messages)

        pipe = mock_redis.pipeline.return_value
        mapping = pipe.hset.call_args[1]["mapping"]
        assert mapping["created_at"] == "1000.0"

    def test_save_trims_old_conversations(self, store, mock_redis):
        mock_redis.zcard.return_value = 52
        mock_redis.zrange.return_value = ["old-1", "old-2"]

        messages = [HumanMessage(content="hello")]
        store.save_conversation(123, "conv-1", messages)

        # Should call zrange to get oldest
        mock_redis.zrange.assert_called_once()
        # Should delete old conversations via pipeline
        assert mock_redis.pipeline.call_count >= 2

    def test_load_messages(self, store, mock_redis):
        serialized = json.dumps([
            {"type": "system", "content": "system"},
            {"type": "human", "content": "hello"},
            {"type": "ai", "content": "hi"},
        ])
        mock_redis.hget.return_value = serialized

        result = store.load_messages(123, "conv-1")
        assert result is not None
        assert len(result) == 3
        assert isinstance(result[0], SystemMessage)
        assert isinstance(result[1], HumanMessage)
        assert isinstance(result[2], AIMessage)

    def test_load_messages_not_found(self, store, mock_redis):
        mock_redis.hget.return_value = None
        result = store.load_messages(123, "nonexistent")
        assert result is None

    def test_list_conversations(self, store, mock_redis):
        mock_redis.zrevrange.return_value = ["conv-1", "conv-2"]
        mock_redis.hgetall.side_effect = [
            {"title": "First", "created_at": "1000.0", "updated_at": "2000.0"},
            {"title": "Second", "created_at": "1500.0", "updated_at": "2500.0"},
        ]

        result = store.list_conversations(123)
        assert len(result) == 2
        assert result[0].conversation_id == "conv-1"
        assert result[0].title == "First"
        assert result[1].conversation_id == "conv-2"

    def test_list_conversations_empty(self, store, mock_redis):
        mock_redis.zrevrange.return_value = []
        result = store.list_conversations(123)
        assert result == []

    def test_list_conversations_skips_missing(self, store, mock_redis):
        mock_redis.zrevrange.return_value = ["conv-1", "conv-2"]
        mock_redis.hgetall.side_effect = [
            {"title": "First", "created_at": "1000.0", "updated_at": "2000.0"},
            {},  # Missing data
        ]

        result = store.list_conversations(123)
        assert len(result) == 1

    def test_delete_conversation(self, store, mock_redis):
        pipe = mock_redis.pipeline.return_value
        pipe.execute.return_value = [1, 1]

        result = store.delete_conversation(123, "conv-1")
        assert result is True

    def test_delete_conversation_not_found(self, store, mock_redis):
        pipe = mock_redis.pipeline.return_value
        pipe.execute.return_value = [0, 0]

        result = store.delete_conversation(123, "nonexistent")
        assert result is False

    def test_get_display_messages(self, store, mock_redis):
        serialized = json.dumps([
            {"type": "system", "content": "system prompt"},
            {"type": "human", "content": "hello"},
            {"type": "ai", "content": ""},  # Empty AI (tool call)
            {"type": "tool", "content": "result", "tool_call_id": "tc1"},
            {"type": "ai", "content": "Here are your movies"},
        ])
        mock_redis.hgetall.return_value = {
            "title": "hello",
            "created_at": "1000.0",
            "updated_at": "2000.0",
            "messages": serialized,
        }

        result = store.get_display_messages(123, "conv-1")
        assert result is not None
        assert result.conversation_id == "conv-1"
        assert result.title == "hello"
        # Should only have user + non-empty assistant messages
        assert len(result.messages) == 2
        assert result.messages[0].role == "user"
        assert result.messages[0].content == "hello"
        assert result.messages[1].role == "assistant"
        assert result.messages[1].content == "Here are your movies"

    def test_get_display_messages_not_found(self, store, mock_redis):
        mock_redis.hgetall.return_value = {}
        result = store.get_display_messages(123, "nonexistent")
        assert result is None
