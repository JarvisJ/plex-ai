import hashlib
import json
from functools import lru_cache
from typing import Any, cast

import redis
from pydantic import BaseModel

from app.config import Settings, get_settings


def _serialize_value(value: Any) -> str:
    """Serialize a value for Redis storage, handling Pydantic models."""
    if isinstance(value, BaseModel):
        return value.model_dump_json()
    if isinstance(value, list) and value and isinstance(value[0], BaseModel):
        return json.dumps([item.model_dump(mode="json") for item in value])
    return json.dumps(value, default=str)


class CacheService:
    """Redis-based cache with TTL support."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._redis: redis.Redis = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
        )

    def _make_key(self, prefix: str, user_id: int | str, *args: Any) -> str:
        """Create a cache key from prefix, user_id, and additional arguments."""
        args_str = json.dumps(args, sort_keys=True, default=str)
        args_hash = hashlib.md5(args_str.encode()).hexdigest()[:8]
        return f"plex:{prefix}:{user_id}:{args_hash}"

    def _make_shared_key(self, prefix: str, *args: Any) -> str:
        """Create a shared cache key (not user-specific)."""
        args_str = json.dumps(args, sort_keys=True, default=str)
        args_hash = hashlib.md5(args_str.encode()).hexdigest()[:16]
        return f"plex:{prefix}:shared:{args_hash}"

    def get(self, key: str) -> Any | None:
        """Get a value from cache if it exists."""
        value = self._redis.get(key)
        if value is None:
            return None
        return json.loads(cast(str, value))

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Set a value in cache with optional TTL override."""
        if ttl is None:
            ttl = self.settings.cache_ttl_seconds
        serialized = _serialize_value(value)
        self._redis.setex(key, ttl, serialized)

    def get_binary(self, key: str) -> bytes | None:
        """Get binary data from cache."""
        # Use a separate Redis client without decode_responses for binary data
        binary_redis = redis.Redis.from_url(self.settings.redis_url, decode_responses=False)
        return binary_redis.get(key)  # type: ignore[return-value]

    def set_binary(self, key: str, value: bytes, ttl: int | None = None) -> None:
        """Set binary data in cache with optional TTL override."""
        if ttl is None:
            ttl = self.settings.cache_ttl_seconds
        binary_redis = redis.Redis.from_url(self.settings.redis_url, decode_responses=False)
        binary_redis.setex(key, ttl, value)

    def delete(self, key: str) -> bool:
        """Delete a specific key from cache."""
        return cast(int, self._redis.delete(key)) > 0

    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern."""
        cursor = 0
        deleted = 0
        while True:
            result = self._redis.scan(cursor, match=f"{pattern}*", count=100)
            cursor, keys = cast(tuple[int, list[str]], result)
            if keys:
                deleted += cast(int, self._redis.delete(*keys))
            if cursor == 0:
                break
        return deleted

    def clear_user_cache(self, user_id: int | str) -> int:
        """Clear all cache entries for a specific user."""
        pattern = f"plex:*:{user_id}:*"
        cursor = 0
        deleted = 0
        while True:
            result = self._redis.scan(cursor, match=pattern, count=100)
            cursor, keys = cast(tuple[int, list[str]], result)
            if keys:
                deleted += cast(int, self._redis.delete(*keys))
            if cursor == 0:
                break
        return deleted

    def clear_all(self) -> None:
        """Clear all plex cache entries."""
        pattern = "plex:*"
        cursor = 0
        while True:
            result = self._redis.scan(cursor, match=pattern, count=100)
            cursor, keys = cast(tuple[int, list[str]], result)
            if keys:
                self._redis.delete(*keys)
            if cursor == 0:
                break


# Singleton cache instance
_cache_instance: CacheService | None = None


@lru_cache
def get_cache_service(settings: Settings | None = None) -> CacheService:
    """Get or create the singleton cache service instance."""
    global _cache_instance
    if _cache_instance is None:
        if settings is None:
            settings = get_settings()
        _cache_instance = CacheService(settings)
    return _cache_instance
