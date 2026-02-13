from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.dependencies import (
    _decode_token,
    get_current_user_token,
    get_plex_token,
    get_plex_token_flexible,
    get_token_from_query_or_header,
)


@pytest.fixture
def settings():
    return Settings(
        session_secret_key="test-secret",
        jwt_algorithm="HS256",
    )


def _make_token(payload: dict, secret: str = "test-secret") -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


class TestDecodeToken:
    def test_valid_token(self, settings):
        payload = {"plex_token": "abc", "user_id": 1}
        token = _make_token(payload)
        result = _decode_token(token, settings)
        assert result["plex_token"] == "abc"
        assert result["user_id"] == 1

    def test_expired_token(self, settings):
        payload = {"plex_token": "abc", "exp": datetime.now(UTC) - timedelta(hours=1)}
        token = _make_token(payload)
        with pytest.raises(HTTPException) as exc_info:
            _decode_token(token, settings)
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail

    def test_invalid_token(self, settings):
        with pytest.raises(HTTPException) as exc_info:
            _decode_token("not-a-valid-token", settings)
        assert exc_info.value.status_code == 401
        assert "Invalid token" in exc_info.value.detail

    def test_wrong_secret(self, settings):
        token = jwt.encode({"data": "test"}, "wrong-secret", algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            _decode_token(token, settings)
        assert exc_info.value.status_code == 401


class TestGetCurrentUserToken:
    def test_missing_header(self, settings):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user_token(authorization=None, settings=settings)
        assert exc_info.value.status_code == 401
        assert "Authorization header required" in exc_info.value.detail

    def test_invalid_scheme(self, settings):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user_token(authorization="Basic abc123", settings=settings)
        assert exc_info.value.status_code == 401
        assert "Invalid authorization scheme" in exc_info.value.detail

    def test_valid_token(self, settings):
        payload = {"plex_token": "tok", "user_id": 42}
        token = _make_token(payload)
        result = get_current_user_token(authorization=f"Bearer {token}", settings=settings)
        assert result["plex_token"] == "tok"
        assert result["user_id"] == 42


class TestGetTokenFromQueryOrHeader:
    def test_token_from_query(self, settings):
        payload = {"plex_token": "q-tok"}
        token = _make_token(payload)
        result = get_token_from_query_or_header(
            authorization=None, token=token, settings=settings
        )
        assert result["plex_token"] == "q-tok"

    def test_token_from_header(self, settings):
        payload = {"plex_token": "h-tok"}
        token = _make_token(payload)
        result = get_token_from_query_or_header(
            authorization=f"Bearer {token}", token=None, settings=settings
        )
        assert result["plex_token"] == "h-tok"

    def test_query_takes_precedence_over_header(self, settings):
        q_payload = {"plex_token": "query"}
        h_payload = {"plex_token": "header"}
        q_token = _make_token(q_payload)
        h_token = _make_token(h_payload)
        result = get_token_from_query_or_header(
            authorization=f"Bearer {h_token}", token=q_token, settings=settings
        )
        assert result["plex_token"] == "query"

    def test_neither_provided(self, settings):
        with pytest.raises(HTTPException) as exc_info:
            get_token_from_query_or_header(
                authorization=None, token=None, settings=settings
            )
        assert exc_info.value.status_code == 401
        assert "Authentication required" in exc_info.value.detail


class TestGetPlexToken:
    def test_with_plex_token(self):
        result = get_plex_token(token_payload={"plex_token": "my-token", "user_id": 1})
        assert result == "my-token"

    def test_without_plex_token(self):
        with pytest.raises(HTTPException) as exc_info:
            get_plex_token(token_payload={"user_id": 1})
        assert exc_info.value.status_code == 401
        assert "missing Plex credentials" in exc_info.value.detail


class TestGetPlexTokenFlexible:
    def test_with_plex_token(self):
        result = get_plex_token_flexible(token_payload={"plex_token": "flex-token"})
        assert result == "flex-token"

    def test_without_plex_token(self):
        with pytest.raises(HTTPException) as exc_info:
            get_plex_token_flexible(token_payload={"user_id": 1})
        assert exc_info.value.status_code == 401
        assert "missing Plex credentials" in exc_info.value.detail
