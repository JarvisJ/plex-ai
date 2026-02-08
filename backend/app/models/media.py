from datetime import datetime

from pydantic import BaseModel


class Server(BaseModel):
    """A Plex server belonging to the user."""

    name: str
    address: str
    port: int
    scheme: str = "http"
    local: bool = False
    owned: bool = True
    client_identifier: str

    @property
    def url(self) -> str:
        return f"{self.scheme}://{self.address}:{self.port}"


class Library(BaseModel):
    """A library section within a Plex server."""

    key: str
    title: str
    type: str  # 'movie', 'show', 'artist', 'photo'
    agent: str | None = None
    scanner: str | None = None
    thumb: str | None = None
    count: int | None = None


class MediaItem(BaseModel):
    """A movie or TV show from a Plex library."""

    rating_key: str
    guid: str  # Universal identifier for matching with watchlist
    title: str
    type: str  # 'movie' or 'show'
    summary: str | None = None
    year: int | None = None
    thumb: str | None = None
    art: str | None = None
    duration_ms: int | None = None
    added_at: datetime | None = None
    originally_available_at: str | None = None

    # For AI recommendations
    genres: list[str] = []
    rating: float | None = None
    content_rating: str | None = None
    view_count: int | None = None
    last_viewed_at: datetime | None = None

    # TV show specific
    season_count: int | None = None
    episode_count: int | None = None


class PaginatedResponse(BaseModel):
    """Paginated list of media items."""

    items: list[MediaItem]
    total: int
    offset: int
    limit: int
    has_more: bool


class WatchlistStatus(BaseModel):
    """Watchlist status for a media item."""

    rating_key: str
    title: str
    on_watchlist: bool


class WatchlistItem(BaseModel):
    """An item on the user's watchlist."""

    guid: str  # Universal identifier (e.g., plex://movie/...)
    title: str
    type: str
    year: int | None = None
    thumb: str | None = None
