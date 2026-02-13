"""Tests for app/main.py — health, hello, CORS, error handling."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient


async def test_health_check(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_hello(client: AsyncClient) -> None:
    response = await client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello from FastAPI!"}


class TestCORSMiddleware:
    async def test_preflight_request(self, client: AsyncClient):
        response = await client.options(
            "/api/hello",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 204
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
        assert response.headers.get("access-control-allow-credentials") == "true"

    async def test_normal_request_with_allowed_origin(self, client: AsyncClient):
        response = await client.get(
            "/api/hello",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    async def test_request_with_disallowed_origin(self, client: AsyncClient):
        response = await client.get(
            "/api/hello",
            headers={"Origin": "http://evil.com"},
        )
        assert response.status_code == 200
        # Disallowed origin should NOT have CORS headers
        assert "access-control-allow-origin" not in response.headers

    async def test_request_without_origin(self, client: AsyncClient):
        response = await client.get("/api/hello")
        assert response.status_code == 200


class TestHTTPExceptionHandler:
    async def test_with_matching_origin(self, client: AsyncClient):
        # Trigger 404 which goes through exception handler
        response = await client.get(
            "/api/nonexistent",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 404 or response.status_code == 405

    async def test_401_with_origin(self, client: AsyncClient):
        # Access an authenticated endpoint without auth to get 401
        response = await client.get(
            "/api/media/servers",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 401
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    async def test_401_without_matching_origin(self, client: AsyncClient):
        response = await client.get(
            "/api/media/servers",
            headers={"Origin": "http://evil.com"},
        )
        assert response.status_code == 401
        # Should not have CORS headers for non-allowed origin
        assert "access-control-allow-origin" not in response.headers
