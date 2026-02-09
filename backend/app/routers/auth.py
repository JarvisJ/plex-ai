from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.dependencies import CurrentUserToken, PlexToken
from app.models.auth import PinResponse, TokenResponse, UserInfo
from app.services.plex_auth import PlexAuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_plex_auth_service(settings: Settings = Depends(get_settings)) -> PlexAuthService:
    return PlexAuthService(settings)


@router.post("/pin", response_model=PinResponse)
async def create_pin(
    auth_service: PlexAuthService = Depends(get_plex_auth_service),
) -> PinResponse:
    """Create a new PIN for Plex authentication.

    Returns PIN details including the auth URL to open in a popup.
    """
    pin_data = await auth_service.create_pin()
    return PinResponse(**pin_data)


@router.get("/pin/{pin_id}", response_model=PinResponse)
async def check_pin(
    pin_id: int,
    code: str,
    auth_service: PlexAuthService = Depends(get_plex_auth_service),
) -> PinResponse:
    """Check if a PIN has been claimed.

    Poll this endpoint until auth_token is returned.
    """
    result = await auth_service.check_pin(pin_id, code)
    if result:
        return PinResponse(
            id=result["id"],
            code=result["code"],
            auth_url="",  # Not needed in response
            auth_token=result["auth_token"],
        )

    # Return current PIN status without auth token
    return PinResponse(
        id=pin_id,
        code=code,
        auth_url="",
        auth_token=None,
    )


@router.post("/token", response_model=TokenResponse)
async def exchange_token(
    pin_id: int,
    code: str,
    auth_service: PlexAuthService = Depends(get_plex_auth_service),
) -> TokenResponse:
    """Exchange an authenticated PIN for a JWT session token."""
    result = await auth_service.check_pin(pin_id, code)
    if not result or not result.get("auth_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN not yet authenticated",
        )

    plex_token = result["auth_token"]

    # Get user info to include in JWT
    user_info = await auth_service.get_user_info(plex_token)

    # Create session JWT
    session_token = auth_service.create_session_token(
        plex_token=plex_token,
        user_id=user_info["id"],
        username=user_info["username"],
    )

    return TokenResponse(access_token=session_token)


@router.get("/me", response_model=UserInfo)
async def get_current_user(
    plex_token: PlexToken,
    token_payload: CurrentUserToken,
    auth_service: PlexAuthService = Depends(get_plex_auth_service),
) -> UserInfo:
    """Get the current authenticated user's information."""
    user_data = await auth_service.get_user_info(plex_token)
    client_identifier = await auth_service.get_owned_server_identifier(plex_token)
    return UserInfo(**user_data, client_identifier=client_identifier)
