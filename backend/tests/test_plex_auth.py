from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest

from app.config import Settings
from app.services.plex_auth import PlexAuthService


@pytest.fixture
def auth_settings():
    return Settings(
        plex_client_identifier="test-client-id",
        plex_product_name="Test Product",
        session_secret_key="test-secret-key-long-enough",
        jwt_algorithm="HS256",
        jwt_expiration_hours=168,
    )


@pytest.fixture
def auth_service(auth_settings):
    return PlexAuthService(auth_settings)


def _make_mock_response(json_data):
    """Create a mock httpx response (json() is sync, raise_for_status() is sync)."""
    resp = MagicMock()
    resp.json.return_value = json_data
    resp.raise_for_status.return_value = None
    return resp


def _make_mock_client(**method_responses):
    """Create a mock async httpx client context manager."""
    mock_client = AsyncMock()
    for method, response in method_responses.items():
        getattr(mock_client, method).return_value = response
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


class TestCreatePin:
    async def test_returns_pin_data(self, auth_service):
        resp = _make_mock_response({
            "id": 12345,
            "code": "ABCD",
            "expiresAt": "2025-01-01T00:00:00Z",
        })
        mock_client = _make_mock_client(post=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.create_pin()

        assert result["id"] == 12345
        assert result["code"] == "ABCD"
        assert "auth_url" in result
        assert "clientID=test-client-id" in result["auth_url"]


class TestCheckPin:
    async def test_token_present(self, auth_service):
        resp = _make_mock_response({
            "id": 12345,
            "code": "ABCD",
            "authToken": "plex-token-123",
        })
        mock_client = _make_mock_client(get=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.check_pin(12345, "ABCD")

        assert result is not None
        assert result["auth_token"] == "plex-token-123"

    async def test_token_absent(self, auth_service):
        resp = _make_mock_response({
            "id": 12345,
            "code": "ABCD",
            "authToken": None,
        })
        mock_client = _make_mock_client(get=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.check_pin(12345, "ABCD")

        assert result is None


class TestGetUserInfo:
    async def test_returns_user_dict(self, auth_service):
        resp = _make_mock_response({
            "id": 99,
            "username": "testuser",
            "email": "test@example.com",
            "thumb": "https://plex.tv/thumb.jpg",
        })
        mock_client = _make_mock_client(get=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.get_user_info("plex-token")

        assert result["id"] == 99
        assert result["username"] == "testuser"
        assert result["email"] == "test@example.com"


class TestGetOwnedServerIdentifier:
    async def test_found_owned_server(self, auth_service):
        resp = _make_mock_response([
            {"product": "Plex Media Server", "owned": True, "clientIdentifier": "server-id-1"},
            {"product": "Plex Web", "owned": True, "clientIdentifier": "web-id"},
        ])
        mock_client = _make_mock_client(get=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.get_owned_server_identifier("plex-token")

        assert result == "server-id-1"

    async def test_no_owned_server(self, auth_service):
        resp = _make_mock_response([
            {"product": "Plex Web", "owned": True, "clientIdentifier": "web-id"},
        ])
        mock_client = _make_mock_client(get=resp)

        with patch("app.services.plex_auth.httpx.AsyncClient", return_value=mock_client):
            result = await auth_service.get_owned_server_identifier("plex-token")

        assert result is None


class TestCreateSessionToken:
    def test_creates_decodable_jwt(self, auth_service, auth_settings):
        token = auth_service.create_session_token(
            plex_token="my-plex-token",
            user_id=42,
            username="testuser",
        )
        decoded = jwt.decode(token, auth_settings.session_secret_key, algorithms=["HS256"])
        assert decoded["plex_token"] == "my-plex-token"
        assert decoded["user_id"] == 42
        assert decoded["username"] == "testuser"
        assert "exp" in decoded
