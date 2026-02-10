import uuid
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    plex_client_identifier: str = str(uuid.uuid4())
    plex_product_name: str = "Plex Media Dashboard"
    session_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24 * 7  # 1 week
    frontend_url: str = "http://localhost:5173"
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_seconds: int = 60 * 60 * 24 * 7  # 1 week

    # LLM settings
    openai_api_key: str = ""
    llm_model: str = "gpt-5.1"  # ß "gpt-4o-mini"


@lru_cache
def get_settings() -> Settings:
    return Settings()
