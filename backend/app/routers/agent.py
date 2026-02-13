"""Router for AI agent chat endpoints."""

import asyncio
import logging
import queue
import threading
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.dependencies import PlexToken
from app.models.agent import ChatRequest
from app.services.agent_service import PlexAgentService
from app.services.cache import CacheService, get_cache_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])


def get_agent_deps(
    plex_token: PlexToken,
    settings: Settings = Depends(get_settings),
    cache: CacheService = Depends(get_cache_service),
) -> tuple[str, Settings, CacheService]:
    """Get the dependencies needed to create an agent service."""
    return plex_token, settings, cache


async def stream_generator(
    agent_service: PlexAgentService,
    message: str,
    conversation_id: str | None,
) -> AsyncGenerator[str, None]:
    """Async generator that streams chunks from the sync generator via a queue."""
    chunk_queue: queue.Queue[str | None] = queue.Queue()

    def run_sync_generator():
        try:
            for chunk in agent_service.chat_stream(message, conversation_id):
                chunk_queue.put(chunk)
        except Exception as e:
            logger.exception("Error in chat stream")
            chunk_queue.put(f"data: {{\"type\": \"error\", \"error\": \"{e}\"}}\n\n")
        finally:
            chunk_queue.put(None)  # Signal completion

    # Start the sync generator in a thread
    thread = threading.Thread(target=run_sync_generator)
    thread.start()

    # Yield chunks as they arrive
    loop = asyncio.get_event_loop()
    while True:
        chunk = await loop.run_in_executor(None, chunk_queue.get)
        if chunk is None:
            break
        yield chunk

    thread.join()


@router.post("/chat")
async def chat(
    chat_request: ChatRequest,
    deps: tuple[str, Settings, CacheService] = Depends(get_agent_deps),
) -> StreamingResponse:
    """Send a message to the Plex assistant and stream the response."""
    plex_token, settings, cache = deps

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key not configured",
        )

    try:
        agent_service = PlexAgentService(
            plex_token=plex_token,
            settings=settings,
            server_name=chat_request.server_name,
            cache=cache,
        )

        return StreamingResponse(
            stream_generator(
                agent_service, chat_request.message, chat_request.conversation_id
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        logger.exception("Failed to process chat message")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to process message: {e}",
        )


@router.delete("/conversation/{conversation_id}")
async def clear_conversation(
    conversation_id: str,
    deps: tuple[str, Settings, CacheService] = Depends(get_agent_deps),
) -> dict[str, str]:
    """Clear a conversation from memory."""
    plex_token, settings, cache = deps

    agent_service = PlexAgentService(
        plex_token=plex_token,
        settings=settings,
        server_name="",  # Not needed for clearing
        cache=cache,
    )

    if agent_service.clear_conversation(conversation_id):
        return {"message": "Conversation cleared"}
    return {"message": "Conversation not found"}
