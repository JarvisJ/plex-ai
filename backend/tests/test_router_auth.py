"""Tests for app/routers/auth.py."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.main import app
from app.routers.auth import get_plex_auth_service
from app.dependencies import get_current_user_token, get_plex_token
from tests.conftest import auth_header


@pytest.fixture
def mock_auth_service():
    svc = AsyncMock()
    # create_session_token is sync, so use a regular return value
    svc.create_session_token = MagicMock(return_value="jwt-token")
    return svc


@pytest.fixture(autouse=True)
def _override_auth_service(mock_auth_service):
    app.dependency_overrides[get_plex_auth_service] = lambda: mock_auth_service
    yield
    app.dependency_overrides.clear()


class TestCreatePin:
    async def test_returns_pin_response(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.create_pin.return_value = {
            "id": 123,
            "code": "ABCD",
            "expires_at": "2025-01-01T00:00:00Z",
            "auth_url": "https://app.plex.tv/auth#?code=ABCD",
        }

        response = await client.post("/api/auth/pin")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 123
        assert data["code"] == "ABCD"
        assert "auth_url" in data


class TestCheckPin:
    async def test_authenticated(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.check_pin.return_value = {
            "id": 123,
            "code": "ABCD",
            "auth_token": "plex-token-abc",
        }

        response = await client.get("/api/auth/pin/123", params={"code": "ABCD"})

        assert response.status_code == 200
        data = response.json()
        assert data["auth_token"] == "plex-token-abc"

    async def test_pending(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.check_pin.return_value = None

        response = await client.get("/api/auth/pin/123", params={"code": "ABCD"})

        assert response.status_code == 200
        data = response.json()
        assert data["auth_token"] is None


class TestExchangeToken:
    async def test_success(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.check_pin.return_value = {
            "id": 123,
            "code": "ABCD",
            "auth_token": "plex-token",
        }
        mock_auth_service.get_user_info.return_value = {
            "id": 42,
            "username": "testuser",
            "email": "test@example.com",
        }
        mock_auth_service.create_session_token.return_value = "jwt-token"

        response = await client.post(
            "/api/auth/token", params={"pin_id": 123, "code": "ABCD"}
        )

        assert response.status_code == 200
        assert response.json()["access_token"] == "jwt-token"

    async def test_pin_not_authenticated(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.check_pin.return_value = None

        response = await client.post(
            "/api/auth/token", params={"pin_id": 123, "code": "ABCD"}
        )

        assert response.status_code == 400


class TestGetCurrentUser:
    async def test_returns_user_info(self, client: AsyncClient, mock_auth_service):
        mock_auth_service.get_user_info.return_value = {
            "id": 42,
            "username": "testuser",
            "email": "test@example.com",
            "thumb": "https://plex.tv/thumb.jpg",
        }
        mock_auth_service.get_owned_server_identifier.return_value = "server-id-123"

        # Override auth deps since this endpoint requires real auth
        app.dependency_overrides[get_current_user_token] = lambda: {
            "plex_token": "test-plex-token",
            "user_id": 42,
            "username": "testuser",
        }
        app.dependency_overrides[get_plex_token] = lambda: "test-plex-token"

        response = await client.get("/api/auth/me")

        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["client_identifier"] == "server-id-123"
