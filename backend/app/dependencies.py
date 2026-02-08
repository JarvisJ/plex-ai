from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Query, status

from app.config import Settings, get_settings


def _decode_token(token: str, settings: Settings) -> dict:
    """Decode and validate a JWT token."""
    try:
        return jwt.decode(
            token,
            settings.session_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_token(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Extract and validate JWT token from Authorization header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.removeprefix("Bearer ")
    return _decode_token(token, settings)


def get_token_from_query_or_header(
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Extract JWT token from query param (for images) or Authorization header."""
    jwt_token: str | None = None

    if token:
        jwt_token = token
    elif authorization and authorization.startswith("Bearer "):
        jwt_token = authorization.removeprefix("Bearer ")

    if not jwt_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return _decode_token(jwt_token, settings)


def get_plex_token_flexible(
    token_payload: dict = Depends(get_token_from_query_or_header),
) -> str:
    """Extract Plex auth token from JWT payload (supports query param auth)."""
    plex_token = token_payload.get("plex_token")
    if not plex_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing Plex credentials",
        )
    return plex_token

def get_plex_token(token_payload: dict = Depends(get_current_user_token)) -> str:
    """Extract Plex auth token from JWT payload."""
    plex_token = token_payload.get("plex_token")
    if not plex_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing Plex credentials",
        )
    return plex_token


CurrentUserToken = Annotated[dict, Depends(get_current_user_token)]
PlexToken = Annotated[str, Depends(get_plex_token)]
