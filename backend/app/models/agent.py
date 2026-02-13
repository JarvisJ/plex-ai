from pydantic import BaseModel

from app.models.media import MediaItem


class AgentMessage(BaseModel):
    """A message in the agent conversation."""

    role: str  # "user" | "assistant"
    content: str
    media_items: list[MediaItem] = []


class ChatRequest(BaseModel):
    """Request to send a message to the agent."""

    message: str
    conversation_id: str | None = None
    server_name: str  # Required for Plex queries


class ChatResponse(BaseModel):
    """Response from the agent."""

    conversation_id: str
    message: AgentMessage
