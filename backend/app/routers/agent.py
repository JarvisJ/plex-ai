"""Router for AI agent chat endpoints."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.dependencies import PlexToken
from app.models.agent import ChatRequest, ChatResponse
from app.services.agent_service import PlexAgentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])


def get_agent_service(
    plex_token: PlexToken,
    settings: Settings = Depends(get_settings),
) -> tuple[str, Settings]:
    """Get the dependencies needed to create an agent service."""
    return plex_token, settings


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    deps: tuple[str, Settings] = Depends(get_agent_service),
) -> ChatResponse:
    """Send a message to the Plex assistant and get a response."""
    plex_token, settings = deps

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key not configured",
        )

    try:
        agent_service = PlexAgentService(
            plex_token=plex_token,
            settings=settings,
            server_name=request.server_name,
        )

        response = await asyncio.to_thread(
            agent_service.chat, request.message, request.conversation_id
        )

        return response
    except Exception as e:
        logger.exception("Failed to process chat message")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to process message: {e}",
        )


@router.delete("/conversation/{conversation_id}")
async def clear_conversation(
    conversation_id: str,
    deps: tuple[str, Settings] = Depends(get_agent_service),
) -> dict[str, str]:
    """Clear a conversation from memory."""
    plex_token, settings = deps

    agent_service = PlexAgentService(
        plex_token=plex_token,
        settings=settings,
        server_name="",  # Not needed for clearing
    )

    if agent_service.clear_conversation(conversation_id):
        return {"message": "Conversation cleared"}
    return {"message": "Conversation not found"}
