from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt

from app.config import Settings


class PlexAuthService:
    """Service for handling Plex PIN-based authentication."""

    PLEX_API_URL = "https://plex.tv/api/v2"
    PLEX_AUTH_URL = "https://app.plex.tv/auth"

    def __init__(self, settings: Settings):
        self.settings = settings
        self._headers = {
            "Accept": "application/json",
            "X-Plex-Product": settings.plex_product_name,
            "X-Plex-Client-Identifier": settings.plex_client_identifier,
        }

    async def create_pin(self) -> dict:
        """Create a new PIN for Plex authentication.

        Returns:
            dict with id, code, expires_at, and auth_url
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.PLEX_API_URL}/pins",
                headers=self._headers,
                data={"strong": "true"},
            )
            response.raise_for_status()
            data = response.json()

            # Build the auth URL for the frontend popup
            auth_params = {
                "clientID": self.settings.plex_client_identifier,
                "code": data["code"],
                "context[device][product]": self.settings.plex_product_name,
            }
            auth_url = f"{self.PLEX_AUTH_URL}#?{urlencode(auth_params)}"

            return {
                "id": data["id"],
                "code": data["code"],
                "expires_at": data.get("expiresAt"),
                "auth_url": auth_url,
            }

    async def check_pin(self, pin_id: int, code: str) -> dict | None:
        """Check if a PIN has been claimed and get the auth token.

        Args:
            pin_id: The PIN ID
            code: The PIN code for verification

        Returns:
            dict with auth_token if claimed, None if still pending
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.PLEX_API_URL}/pins/{pin_id}",
                headers=self._headers,
                params={"code": code},
            )
            response.raise_for_status()
            data = response.json()

            auth_token = data.get("authToken")
            if auth_token:
                return {
                    "id": data["id"],
                    "code": data["code"],
                    "auth_token": auth_token,
                }
            return None

    async def get_user_info(self, plex_token: str) -> dict:
        """Get user information from Plex using the auth token.

        Args:
            plex_token: The Plex auth token

        Returns:
            dict with user information
        """
        headers = {**self._headers, "X-Plex-Token": plex_token}
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.PLEX_API_URL}/user",
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

            return {
                "id": data["id"],
                "username": data["username"],
                "email": data.get("email"),
                "thumb": data.get("thumb"),
            }

    async def get_owned_server_identifier(self, plex_token: str) -> str | None:
        """Get the client identifier of the user's owned Plex server.

        Args:
            plex_token: The Plex auth token

        Returns:
            The client identifier of the first owned server, or None if no owned server exists
        """
        headers = {**self._headers, "X-Plex-Token": plex_token}
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.PLEX_API_URL}/resources",
                headers=headers,
            )
            response.raise_for_status()
            resources = response.json()

            # Find the first owned Plex Media Server
            for resource in resources:
                if (
                    resource.get("product") == "Plex Media Server"
                    and resource.get("owned")
                ):
                    client_id: str | None = resource.get("clientIdentifier")
                    return client_id

            return None

    def create_session_token(self, plex_token: str, user_id: int, username: str) -> str:
        """Create a JWT session token containing the Plex token.

        Args:
            plex_token: The Plex auth token
            user_id: The Plex user ID
            username: The Plex username

        Returns:
            JWT token string
        """
        expiration = datetime.now(UTC) + timedelta(
            hours=self.settings.jwt_expiration_hours
        )
        payload = {
            "plex_token": plex_token,
            "user_id": user_id,
            "username": username,
            "exp": expiration,
        }
        return jwt.encode(
            payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )
