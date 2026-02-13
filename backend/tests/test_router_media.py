"""Tests for app/routers/media.py."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.dependencies import get_current_user_token, get_plex_token, get_plex_token_flexible
from app.main import app
from app.models.media import (
    Library,
    PaginatedResponse,
    Server,
    WatchlistItem,
    WatchlistStatus,
)
from app.routers.media import get_plex_client, get_plex_client_flexible
from app.services.cache import CacheService, get_cache_service


@pytest.fixture
def mock_plex():
    return MagicMock()


@pytest.fixture
def mock_cache_svc():
    cache = MagicMock(spec=CacheService)
    cache._make_shared_key.return_value = "plex:thumb:shared:abc"
    cache.get_binary.return_value = None
    cache.clear_user_cache.return_value = 5
    return cache


@pytest.fixture(autouse=True)
def _override_deps(mock_plex, mock_cache_svc):
    app.dependency_overrides[get_plex_client] = lambda: mock_plex
    app.dependency_overrides[get_plex_client_flexible] = lambda: mock_plex
    app.dependency_overrides[get_cache_service] = lambda: mock_cache_svc
    app.dependency_overrides[get_current_user_token] = lambda: {
        "plex_token": "test-plex-token",
        "user_id": 123,
        "username": "testuser",
    }
    app.dependency_overrides[get_plex_token] = lambda: "test-plex-token"
    app.dependency_overrides[get_plex_token_flexible] = lambda: "test-plex-token"
    yield
    app.dependency_overrides.clear()


class TestGetServers:
    async def test_success(self, client: AsyncClient, mock_plex):
        mock_plex.get_servers.return_value = [
            Server(name="MyServer", address="1.2.3.4", port=32400, scheme="https", client_identifier="cid")
        ]

        response = await client.get("/api/media/servers")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "MyServer"

    async def test_error(self, client: AsyncClient, mock_plex):
        mock_plex.get_servers.side_effect = Exception("Connection failed")

        response = await client.get("/api/media/servers")

        assert response.status_code == 502


class TestGetLibraries:
    async def test_success(self, client: AsyncClient, mock_plex):
        mock_plex.get_libraries.return_value = [
            Library(key="1", title="Movies", type="movie")
        ]

        response = await client.get(
            "/api/media/libraries", params={"server_name": "MyServer"}
        )

        assert response.status_code == 200
        assert response.json()[0]["title"] == "Movies"

    async def test_error(self, client: AsyncClient, mock_plex):
        mock_plex.get_libraries.side_effect = Exception("Server error")

        response = await client.get(
            "/api/media/libraries", params={"server_name": "MyServer"}
        )

        assert response.status_code == 502


class TestGetLibraryItems:
    async def test_success(self, client: AsyncClient, mock_plex):
        mock_plex.get_library_items.return_value = PaginatedResponse(
            items=[],
            total=100,
            offset=0,
            limit=50,
            has_more=True,
        )

        response = await client.get(
            "/api/media/libraries/1/items",
            params={"server_name": "MyServer", "offset": 0, "limit": 50},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 100
        assert data["has_more"] is True

    async def test_error(self, client: AsyncClient, mock_plex):
        mock_plex.get_library_items.side_effect = Exception("Fetch failed")

        response = await client.get(
            "/api/media/libraries/1/items",
            params={"server_name": "MyServer"},
        )

        assert response.status_code == 502


class TestGetThumbnail:
    async def test_cache_hit(self, client: AsyncClient, mock_plex, mock_cache_svc):
        mock_cache_svc.get_binary.return_value = b"fake-image-data"

        response = await client.get(
            "/api/media/thumbnail",
            params={"server_name": "MyServer", "path": "/thumb/1"},
        )

        assert response.status_code == 200
        assert response.headers.get("x-cache") == "HIT"

    async def test_cache_miss(self, client: AsyncClient, mock_plex, mock_cache_svc):
        mock_cache_svc.get_binary.return_value = None
        mock_plex.get_thumbnail_url.return_value = "https://plex.example.com/thumb?token=abc"

        class FakeResponse:
            content = b"fetched-image"
            headers = {"content-type": "image/jpeg"}
            status_code = 200
            def raise_for_status(self): pass

        class FakeHttpxClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def get(self, url, **kwargs): return FakeResponse()

        with patch("app.routers.media.httpx.AsyncClient", return_value=FakeHttpxClient()):
            response = await client.get(
                "/api/media/thumbnail",
                params={"server_name": "MyServer", "path": "/thumb/1"},
            )

        assert response.status_code == 200
        assert response.headers.get("x-cache") == "MISS"

    async def test_error(self, client: AsyncClient, mock_plex, mock_cache_svc):
        mock_cache_svc.get_binary.return_value = None
        mock_plex.get_thumbnail_url.side_effect = Exception("Connection error")

        response = await client.get(
            "/api/media/thumbnail",
            params={"server_name": "MyServer", "path": "/thumb/1"},
        )

        assert response.status_code == 502


class TestClearCache:
    async def test_with_user_id(self, client: AsyncClient, mock_cache_svc):
        mock_cache_svc.clear_user_cache.return_value = 5

        response = await client.delete("/api/media/cache")

        assert response.status_code == 200
        assert "5" in response.json()["message"]

    async def test_without_user_id(self, client: AsyncClient, mock_cache_svc):
        # Override to return payload without user_id
        app.dependency_overrides[get_current_user_token] = lambda: {
            "plex_token": "test-plex-token",
        }

        response = await client.delete("/api/media/cache")

        assert response.status_code == 200
        assert "No cache" in response.json()["message"]


class TestWatchlistEndpoints:
    async def test_get_watchlist_success(self, client: AsyncClient, mock_plex):
        mock_plex.get_watchlist.return_value = [
            WatchlistItem(guid="plex://movie/1", title="Test", type="movie")
        ]

        response = await client.get("/api/media/watchlist")

        assert response.status_code == 200
        assert len(response.json()) == 1

    async def test_get_watchlist_error(self, client: AsyncClient, mock_plex):
        mock_plex.get_watchlist.side_effect = Exception("Error")

        response = await client.get("/api/media/watchlist")

        assert response.status_code == 502

    async def test_get_watchlist_status_success(self, client: AsyncClient, mock_plex):
        mock_plex.get_watchlist_status.return_value = WatchlistStatus(
            rating_key="1", title="Test", on_watchlist=True
        )

        response = await client.get(
            "/api/media/watchlist/status",
            params={"server_name": "MyServer", "rating_key": "1"},
        )

        assert response.status_code == 200
        assert response.json()["on_watchlist"] is True

    async def test_add_to_watchlist_success(self, client: AsyncClient, mock_plex):
        mock_plex.add_to_watchlist.return_value = WatchlistStatus(
            rating_key="1", title="Test", on_watchlist=True
        )

        response = await client.post(
            "/api/media/watchlist",
            params={"server_name": "MyServer", "rating_key": "1"},
        )

        assert response.status_code == 200
        assert response.json()["on_watchlist"] is True

    async def test_add_to_watchlist_error(self, client: AsyncClient, mock_plex):
        mock_plex.add_to_watchlist.side_effect = Exception("Error")

        response = await client.post(
            "/api/media/watchlist",
            params={"server_name": "MyServer", "rating_key": "1"},
        )

        assert response.status_code == 502

    async def test_remove_from_watchlist_success(self, client: AsyncClient, mock_plex):
        mock_plex.remove_from_watchlist.return_value = WatchlistStatus(
            rating_key="1", title="Test", on_watchlist=False
        )

        response = await client.delete(
            "/api/media/watchlist",
            params={"server_name": "MyServer", "rating_key": "1"},
        )

        assert response.status_code == 200
        assert response.json()["on_watchlist"] is False

    async def test_remove_from_watchlist_error(self, client: AsyncClient, mock_plex):
        mock_plex.remove_from_watchlist.side_effect = Exception("Error")

        response = await client.delete(
            "/api/media/watchlist",
            params={"server_name": "MyServer", "rating_key": "1"},
        )

        assert response.status_code == 502
