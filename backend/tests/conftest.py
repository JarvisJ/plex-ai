from unittest.mock import MagicMock, patch

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import app
from app.services.cache import CacheService


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.fixture
def settings() -> Settings:
    return Settings(
        plex_client_identifier="test-client-id",
        plex_product_name="Test Product",
        session_secret_key="test-secret-key",
        jwt_algorithm="HS256",
        jwt_expiration_hours=168,
        redis_url="redis://localhost:6379/0",
        cache_ttl_seconds=604800,
        openai_api_key="test-openai-key",
        llm_model="gpt-4o-mini",
    )


@pytest.fixture
def mock_redis():
    r = MagicMock()
    r.get.return_value = None
    r.setex.return_value = True
    r.delete.return_value = 1
    r.scan.return_value = (0, [])
    return r


@pytest.fixture
def mock_cache(settings, mock_redis):
    with patch("app.services.cache.redis.Redis.from_url", return_value=mock_redis):
        cache = CacheService(settings)
    cache._redis = mock_redis
    return cache


@pytest.fixture
def mock_plex_client():
    client = MagicMock()
    client.get_servers.return_value = []
    client.get_libraries.return_value = []
    client.get_all_library_items.return_value = []
    return client


def make_jwt(payload: dict, secret: str = "test-secret-key", algorithm: str = "HS256") -> str:
    return jwt.encode(payload, secret, algorithm=algorithm)


def auth_header(plex_token: str = "test-plex-token", user_id: int = 123, username: str = "testuser") -> dict[str, str]:
    token = make_jwt({"plex_token": plex_token, "user_id": user_id, "username": username})
    return {"Authorization": f"Bearer {token}"}
