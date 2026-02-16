"""Conversation persistence using Redis."""

import json
import time
from typing import Any

import redis
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from app.models.agent import AgentMessage, ConversationHistory, ConversationSummary

# 30 days TTL for conversations
CONVERSATION_TTL = 30 * 24 * 60 * 60
MAX_CONVERSATIONS_PER_USER = 50


def _serialize_message(msg: BaseMessage) -> dict[str, Any]:
    """Serialize a LangChain message to a dict for storage."""
    data: dict[str, Any] = {"content": msg.content}

    if isinstance(msg, HumanMessage):
        data["type"] = "human"
    elif isinstance(msg, AIMessage):
        data["type"] = "ai"
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            data["tool_calls"] = msg.tool_calls
    elif isinstance(msg, SystemMessage):
        data["type"] = "system"
    elif isinstance(msg, ToolMessage):
        data["type"] = "tool"
        data["tool_call_id"] = msg.tool_call_id
    else:
        data["type"] = "unknown"

    return data


def _deserialize_message(data: dict[str, Any]) -> BaseMessage:
    """Deserialize a dict back to a LangChain message."""
    msg_type = data["type"]
    content = data["content"]

    if msg_type == "human":
        return HumanMessage(content=content)
    elif msg_type == "ai":
        msg = AIMessage(content=content)
        if "tool_calls" in data:
            msg.tool_calls = data["tool_calls"]
        return msg
    elif msg_type == "system":
        return SystemMessage(content=content)
    elif msg_type == "tool":
        return ToolMessage(content=content, tool_call_id=data.get("tool_call_id", ""))
    else:
        return HumanMessage(content=content)


def _derive_title(messages: list[BaseMessage]) -> str:
    """Derive a title from the first human message, truncated to 80 chars."""
    for msg in messages:
        if isinstance(msg, HumanMessage) and msg.content:
            content = str(msg.content).strip()
            if len(content) > 80:
                return content[:77] + "..."
            return content
    return "New conversation"


class ConversationStore:
    """Redis-backed conversation persistence."""

    def __init__(self, redis_client: redis.Redis):
        self._redis = redis_client

    def _conv_key(self, user_id: int, conversation_id: str) -> str:
        return f"plex:conversations:{user_id}:{conversation_id}"

    def _index_key(self, user_id: int) -> str:
        return f"plex:conv_index:{user_id}"

    def save_conversation(
        self,
        user_id: int,
        conversation_id: str,
        messages: list[BaseMessage],
        title: str | None = None,
    ) -> None:
        """Save conversation messages to Redis."""
        now = time.time()
        conv_key = self._conv_key(user_id, conversation_id)
        index_key = self._index_key(user_id)

        if title is None:
            title = _derive_title(messages)

        serialized = json.dumps([_serialize_message(m) for m in messages])

        # Check if conversation already exists (to preserve created_at)
        existing_created = self._redis.hget(conv_key, "created_at")
        created_at = float(existing_created) if existing_created else now

        pipe = self._redis.pipeline()
        pipe.hset(
            conv_key,
            mapping={
                "title": title,
                "created_at": str(created_at),
                "updated_at": str(now),
                "messages": serialized,
            },
        )
        pipe.expire(conv_key, CONVERSATION_TTL)
        pipe.zadd(index_key, {conversation_id: now})
        pipe.expire(index_key, CONVERSATION_TTL)
        pipe.execute()

        # Trim to max conversations
        count = self._redis.zcard(index_key)
        if count and count > MAX_CONVERSATIONS_PER_USER:
            # Remove oldest conversations
            to_remove = self._redis.zrange(
                index_key, 0, count - MAX_CONVERSATIONS_PER_USER - 1
            )
            if to_remove:
                pipe = self._redis.pipeline()
                for old_id in to_remove:
                    pipe.delete(self._conv_key(user_id, old_id))
                pipe.zremrangebyrank(
                    index_key, 0, count - MAX_CONVERSATIONS_PER_USER - 1
                )
                pipe.execute()

    def load_messages(
        self, user_id: int, conversation_id: str
    ) -> list[BaseMessage] | None:
        """Load conversation messages from Redis."""
        conv_key = self._conv_key(user_id, conversation_id)
        raw = self._redis.hget(conv_key, "messages")
        if raw is None:
            return None
        data = json.loads(raw)
        return [_deserialize_message(d) for d in data]

    def list_conversations(
        self, user_id: int, limit: int = 20
    ) -> list[ConversationSummary]:
        """List conversations for a user, newest first."""
        index_key = self._index_key(user_id)
        # Get newest first
        conv_ids = self._redis.zrevrange(index_key, 0, limit - 1)
        if not conv_ids:
            return []

        results: list[ConversationSummary] = []
        for conv_id in conv_ids:
            conv_key = self._conv_key(user_id, conv_id)
            data = self._redis.hgetall(conv_key)
            if not data:
                continue
            results.append(
                ConversationSummary(
                    conversation_id=conv_id,
                    title=data.get("title", "Untitled"),
                    created_at=float(data.get("created_at", 0)),
                    updated_at=float(data.get("updated_at", 0)),
                )
            )

        return results

    def delete_conversation(self, user_id: int, conversation_id: str) -> bool:
        """Delete a conversation from Redis."""
        conv_key = self._conv_key(user_id, conversation_id)
        index_key = self._index_key(user_id)
        pipe = self._redis.pipeline()
        pipe.delete(conv_key)
        pipe.zrem(index_key, conversation_id)
        results = pipe.execute()
        return results[0] > 0

    def get_display_messages(
        self, user_id: int, conversation_id: str
    ) -> ConversationHistory | None:
        """Load conversation and filter to user/assistant messages only."""
        conv_key = self._conv_key(user_id, conversation_id)
        data = self._redis.hgetall(conv_key)
        if not data:
            return None

        raw_messages = data.get("messages")
        if not raw_messages:
            return None

        all_messages = json.loads(raw_messages)
        display_messages: list[AgentMessage] = []
        for msg_data in all_messages:
            msg_type = msg_data.get("type")
            if msg_type in ("human", "ai"):
                content = msg_data.get("content", "")
                if not content:
                    continue
                role = "user" if msg_type == "human" else "assistant"
                display_messages.append(
                    AgentMessage(role=role, content=content, media_items=[])
                )

        return ConversationHistory(
            conversation_id=conversation_id,
            title=data.get("title", "Untitled"),
            messages=display_messages,
        )
