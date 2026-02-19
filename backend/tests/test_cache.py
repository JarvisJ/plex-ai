import json
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from app.services.cache import CacheService, _serialize_value, get_cache_service


class SampleModel(BaseModel):
    name: str
    value: int


class TestSerializeValue:
    def test_basemodel_instance(self):
        model = SampleModel(name="test", value=42)
        result = _serialize_value(model)
        parsed = json.loads(result)
        assert parsed["name"] == "test"
        assert parsed["value"] == 42

    def test_list_of_basemodels(self):
        models = [SampleModel(name="a", value=1), SampleModel(name="b", value=2)]
        result = _serialize_value(models)
        parsed = json.loads(result)
        assert len(parsed) == 2
        assert parsed[0]["name"] == "a"
        assert parsed[1]["value"] == 2

    def test_plain_dict(self):
        data = {"key": "value", "num": 123}
        result = _serialize_value(data)
        assert json.loads(result) == data

    def test_empty_list(self):
        result = _serialize_value([])
        assert json.loads(result) == []


class TestCacheServiceMakeKey:
    def test_deterministic(self, mock_cache):
        key1 = mock_cache._make_key("prefix", 123, "arg1")
        key2 = mock_cache._make_key("prefix", 123, "arg1")
        assert key1 == key2

    def test_different_args_different_keys(self, mock_cache):
        key1 = mock_cache._make_key("prefix", 123, "arg1")
        key2 = mock_cache._make_key("prefix", 123, "arg2")
        assert key1 != key2

    def test_format(self, mock_cache):
        key = mock_cache._make_key("servers", 123, "myserver")
        assert key.startswith("plex:servers:123:")


class TestCacheServiceMakeSharedKey:
    def test_deterministic(self, mock_cache):
        key1 = mock_cache._make_shared_key("thumb", "server", "/path")
        key2 = mock_cache._make_shared_key("thumb", "server", "/path")
        assert key1 == key2

    def test_format(self, mock_cache):
        key = mock_cache._make_shared_key("thumb", "server", "/path")
        assert key.startswith("plex:thumb:shared:")


class TestCacheServiceGetSet:
    def test_cache_miss(self, mock_cache, mock_redis):
        mock_redis.get.return_value = None
        result = mock_cache.get("some-key")
        assert result is None

    def test_cache_hit(self, mock_cache, mock_redis):
        mock_redis.get.return_value = json.dumps({"data": "cached"})
        result = mock_cache.get("some-key")
        assert result == {"data": "cached"}

    def test_set_default_ttl(self, mock_cache, mock_redis, settings):
        mock_cache.set("key", {"value": 1})
        mock_redis.setex.assert_called_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][1] == settings.cache_ttl_seconds

    def test_set_custom_ttl(self, mock_cache, mock_redis):
        mock_cache.set("key", {"value": 1}, ttl=300)
        call_args = mock_redis.setex.call_args
        assert call_args[0][1] == 300


class TestCacheServiceBinary:
    def test_get_binary(self, mock_cache, settings):
        mock_cache._binary_redis.get.return_value = b"image-data"
        result = mock_cache.get_binary("thumb-key")
        assert result == b"image-data"

    def test_set_binary_default_ttl(self, mock_cache, settings):
        mock_cache.set_binary("thumb-key", b"data")
        mock_cache._binary_redis.setex.assert_called_once_with("thumb-key", settings.cache_ttl_seconds, b"data")

    def test_set_binary_custom_ttl(self, mock_cache, settings):
        mock_cache.set_binary("thumb-key", b"data", ttl=600)
        mock_cache._binary_redis.setex.assert_called_once_with("thumb-key", 600, b"data")


class TestCacheServiceDelete:
    def test_delete_key_exists(self, mock_cache, mock_redis):
        mock_redis.delete.return_value = 1
        assert mock_cache.delete("some-key") is True

    def test_delete_key_missing(self, mock_cache, mock_redis):
        mock_redis.delete.return_value = 0
        assert mock_cache.delete("some-key") is False


class TestCacheServiceDeletePattern:
    def test_matches_keys(self, mock_cache, mock_redis):
        mock_redis.scan.return_value = (0, ["plex:a:1", "plex:a:2"])
        mock_redis.delete.return_value = 2
        result = mock_cache.delete_pattern("plex:a:")
        assert result == 2

    def test_no_matches(self, mock_cache, mock_redis):
        mock_redis.scan.return_value = (0, [])
        result = mock_cache.delete_pattern("plex:none:")
        assert result == 0

    def test_multi_page_scan(self, mock_cache, mock_redis):
        mock_redis.scan.side_effect = [
            (42, ["key1", "key2"]),
            (0, ["key3"]),
        ]
        mock_redis.delete.side_effect = [2, 1]
        result = mock_cache.delete_pattern("plex:test:")
        assert result == 3
        assert mock_redis.scan.call_count == 2


class TestCacheServiceClearUserCache:
    def test_clears_user_keys(self, mock_cache, mock_redis):
        mock_redis.scan.return_value = (0, ["plex:a:123:hash1"])
        mock_redis.delete.return_value = 1
        result = mock_cache.clear_user_cache(123)
        assert result == 1

    def test_multi_page_scan(self, mock_cache, mock_redis):
        mock_redis.scan.side_effect = [
            (5, ["k1", "k2"]),
            (0, ["k3"]),
        ]
        mock_redis.delete.side_effect = [2, 1]
        result = mock_cache.clear_user_cache(123)
        assert result == 3


class TestCacheServiceClearAll:
    def test_clears_all_plex_keys(self, mock_cache, mock_redis):
        mock_redis.scan.return_value = (0, ["plex:a", "plex:b"])
        mock_cache.clear_all()
        mock_redis.delete.assert_called_once_with("plex:a", "plex:b")

    def test_multi_page_scan(self, mock_cache, mock_redis):
        mock_redis.scan.side_effect = [
            (5, ["k1"]),
            (0, ["k2"]),
        ]
        mock_cache.clear_all()
        assert mock_redis.delete.call_count == 2


class TestGetCacheService:
    def test_creates_singleton(self, settings):
        import app.services.cache as cache_module

        # Reset singleton state
        cache_module._cache_instance = None
        cache_module.get_cache_service.cache_clear()

        with patch("app.services.cache.redis.Redis.from_url"):
            # Call without settings arg to avoid lru_cache hashability issue
            with patch("app.services.cache.get_settings", return_value=settings):
                svc = get_cache_service()
        assert isinstance(svc, CacheService)

        # Cleanup
        cache_module._cache_instance = None
        cache_module.get_cache_service.cache_clear()
