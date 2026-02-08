from pydantic import BaseModel


class PinRequest(BaseModel):
    """Request to create a new Plex PIN for authentication."""

    pass


class PinResponse(BaseModel):
    """Response containing PIN information for Plex authentication."""

    id: int
    code: str
    auth_url: str
    expires_at: str | None = None
    auth_token: str | None = None


class TokenResponse(BaseModel):
    """JWT token response after successful authentication."""

    access_token: str
    token_type: str = "bearer"


class UserInfo(BaseModel):
    """Current authenticated user information."""

    id: int
    username: str
    email: str | None = None
    thumb: str | None = None
