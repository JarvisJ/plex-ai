import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.config import Settings, get_settings
from app.dependencies import CurrentUserToken, PlexToken, get_plex_token_flexible
from app.models.media import Library, PaginatedResponse, Server, WatchlistItem, WatchlistStatus
from app.services.cache import CacheService, get_cache_service
from app.services.plex_client import PlexClientService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media", tags=["media"])


def get_plex_client(
    plex_token: PlexToken,
    settings: Settings = Depends(get_settings),
    cache: CacheService = Depends(get_cache_service),
) -> PlexClientService:
    return PlexClientService(plex_token, settings, cache)


@router.get("/servers", response_model=list[Server])
async def get_servers(
    plex_client: PlexClientService = Depends(get_plex_client),
) -> list[Server]:
    """Get all Plex servers available to the authenticated user."""
    try:
        return await asyncio.to_thread(plex_client.get_servers)
    except Exception as e:
        logger.exception("Failed to get servers")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Plex: {e}",
        )


@router.get("/libraries", response_model=list[Library])
async def get_libraries(
    server_name: str,
    plex_client: PlexClientService = Depends(get_plex_client),
) -> list[Library]:
    """Get all libraries from a specific Plex server."""
    try:
        return await asyncio.to_thread(plex_client.get_libraries, server_name)
    except Exception as e:
        logger.exception("Failed to get libraries from %s", server_name)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Plex server: {e}",
        )


@router.get("/libraries/{library_key}/items", response_model=PaginatedResponse)
async def get_library_items(
    library_key: str,
    server_name: str,
    offset: int = 0,
    limit: int = 50,
    plex_client: PlexClientService = Depends(get_plex_client),
) -> PaginatedResponse:
    """Get paginated items from a library."""
    try:
        return await asyncio.to_thread(
            plex_client.get_library_items, server_name, library_key, offset, limit
        )
    except Exception as e:
        logger.exception("Failed to get library items")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch library items: {e}",
        )


def get_plex_client_flexible(
    plex_token: str = Depends(get_plex_token_flexible),
    settings: Settings = Depends(get_settings),
    cache: CacheService = Depends(get_cache_service),
) -> PlexClientService:
    return PlexClientService(plex_token, settings, cache)


@router.get("/thumbnail")
async def get_thumbnail(
    server_name: str,
    path: str,
    plex_client: PlexClientService = Depends(get_plex_client_flexible),
) -> Response:
    """Proxy a thumbnail image from the Plex server."""
    try:
        thumbnail_url = await asyncio.to_thread(
            plex_client.get_thumbnail_url, server_name, path
        )
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(thumbnail_url, timeout=30)
            response.raise_for_status()
            return Response(
                content=response.content,
                media_type=response.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except Exception as e:
        logger.exception("Failed to get thumbnail")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get thumbnail: {e}",
        )


@router.delete("/cache")
async def clear_cache(
    token_payload: CurrentUserToken,
    cache: CacheService = Depends(get_cache_service),
) -> dict[str, str]:
    """Clear the current user's cache."""
    user_id = token_payload.get("user_id")
    if user_id:
        cleared = cache.clear_user_cache(user_id)
        return {"message": f"Cleared {cleared} cache entries"}
    return {"message": "No cache entries to clear"}


@router.get("/watchlist", response_model=list[WatchlistItem])
async def get_watchlist(
    plex_client: PlexClientService = Depends(get_plex_client),
) -> list[WatchlistItem]:
    """Get all items on the user's watchlist."""
    try:
        return await asyncio.to_thread(plex_client.get_watchlist)
    except Exception as e:
        logger.exception("Failed to get watchlist")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get watchlist: {e}",
        )


@router.get("/watchlist/status", response_model=WatchlistStatus)
async def get_watchlist_status(
    server_name: str,
    rating_key: str,
    plex_client: PlexClientService = Depends(get_plex_client),
) -> WatchlistStatus:
    """Check if an item is on the user's watchlist."""
    try:
        return await asyncio.to_thread(
            plex_client.get_watchlist_status, server_name, rating_key
        )
    except Exception as e:
        logger.exception("Failed to get watchlist status")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get watchlist status: {e}",
        )


@router.post("/watchlist", response_model=WatchlistStatus)
async def add_to_watchlist(
    server_name: str,
    rating_key: str,
    plex_client: PlexClientService = Depends(get_plex_client),
) -> WatchlistStatus:
    """Add an item to the user's watchlist."""
    try:
        return await asyncio.to_thread(
            plex_client.add_to_watchlist, server_name, rating_key
        )
    except Exception as e:
        logger.exception("Failed to add to watchlist")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to add to watchlist: {e}",
        )


@router.delete("/watchlist", response_model=WatchlistStatus)
async def remove_from_watchlist(
    server_name: str,
    rating_key: str,
    plex_client: PlexClientService = Depends(get_plex_client),
) -> WatchlistStatus:
    """Remove an item from the user's watchlist."""
    try:
        return await asyncio.to_thread(
            plex_client.remove_from_watchlist, server_name, rating_key
        )
    except Exception as e:
        logger.exception("Failed to remove from watchlist")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to remove from watchlist: {e}",
        )
