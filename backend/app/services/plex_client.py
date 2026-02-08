from datetime import UTC, datetime

from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer
from plexapi.video import Movie, Show

from app.config import Settings
from app.models.media import (
    Library,
    MediaItem,
    PaginatedResponse,
    Server,
    WatchlistItem,
    WatchlistStatus,
)
from app.services.cache import CacheService

# Timeout for Plex API requests (in seconds)
PLEX_TIMEOUT = 60


class PlexClientService:
    """Service for interacting with Plex servers via plexapi."""

    def __init__(self, plex_token: str, settings: Settings, cache: CacheService):
        self.plex_token = plex_token
        self.settings = settings
        self.cache = cache
        self._account: MyPlexAccount | None = None

    @property
    def account(self) -> MyPlexAccount:
        """Lazy-load the MyPlexAccount instance."""
        if self._account is None:
            self._account = MyPlexAccount(token=self.plex_token, timeout=PLEX_TIMEOUT)
        return self._account

    def _get_user_id(self) -> int:
        """Get the user ID from the account for cache key generation."""
        return self.account.id

    def get_servers(self) -> list[Server]:
        """Get all Plex servers available to the user."""
        user_id = self._get_user_id()
        cache_key = self.cache._make_key("servers", user_id)

        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        servers = []
        for resource in self.account.resources():
            if resource.product == "Plex Media Server":
                for connection in resource.connections:
                    if not connection.local:
                        servers.append(
                            Server(
                                name=resource.name,
                                address=connection.address,
                                port=connection.port,
                                scheme=connection.protocol,
                                local=connection.local,
                                owned=resource.owned,
                                client_identifier=resource.clientIdentifier,
                            )
                        )

        self.cache.set(cache_key, servers)
        return servers

    def _connect_to_server(self, server_name: str) -> PlexServer:
        """Connect to a Plex server by name using account resources.

        This method properly handles both owned and shared servers.
        """
        resource = self.account.resource(server_name)
        # Connect with SSL verification disabled for self-signed certs
        return resource.connect(ssl=False, timeout=PLEX_TIMEOUT)

    def get_libraries(self, server_name: str) -> list[Library]:
        """Get all libraries from a specific Plex server."""
        user_id = self._get_user_id()
        cache_key = self.cache._make_key("libraries", user_id, server_name)

        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        server = self._connect_to_server(server_name)
        libraries = []

        for section in server.library.sections():
            if section.type in ("movie", "show"):
                libraries.append(
                    Library(
                        key=str(section.key),
                        title=section.title,
                        type=section.type,
                        agent=section.agent,
                        scanner=section.scanner,
                        thumb=section.thumb,
                        count=section.totalSize,
                    )
                )

        self.cache.set(cache_key, libraries)
        return libraries

    def get_library_items(
        self,
        server_name: str,
        library_key: str,
        offset: int = 0,
        limit: int = 50,
    ) -> PaginatedResponse:
        """Get paginated items from a library."""
        user_id = self._get_user_id()
        cache_key = self.cache._make_key(
            "library_items", user_id, server_name, library_key, offset, limit
        )

        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        server = self._connect_to_server(server_name)
        section = server.library.sectionByID(int(library_key))

        # Get total count
        total = section.totalSize

        # Get paginated items
        all_items = section.all(container_start=offset, container_size=limit)

        items = []
        for item in all_items:
            media_item = self._convert_to_media_item(item)
            if media_item:
                items.append(media_item)

        response = PaginatedResponse(
            items=items,
            total=total,
            offset=offset,
            limit=limit,
            has_more=(offset + limit) < total,
        )

        self.cache.set(cache_key, response)
        return response

    def _extract_guid(self, item: Movie | Show) -> str:
        """Extract a unique guid from a Plex item."""
        # Try direct guid attribute (e.g., 'plex://movie/...')
        if hasattr(item, "guid") and item.guid:
            return item.guid

        # Fallback to constructing from type and ratingKey
        item_type = getattr(item, "type", "unknown")
        rating_key = getattr(item, "ratingKey", None)
        if rating_key:
            return f"plex://{item_type}/{rating_key}"

        # Last resort
        title = getattr(item, "title", "unknown")
        year = getattr(item, "year", "unknown")
        return f"local://{item_type}/{title}/{year}"

    def _convert_to_media_item(self, item: Movie | Show) -> MediaItem | None:
        """Convert a plexapi item to our MediaItem model."""
        if isinstance(item, Movie):
            return MediaItem(
                rating_key=str(item.ratingKey),
                guid=self._extract_guid(item),
                title=item.title,
                type="movie",
                summary=item.summary,
                year=item.year,
                thumb=item.thumb,
                art=item.art,
                duration_ms=item.duration,
                added_at=self._parse_datetime(item.addedAt),
                originally_available_at=(
                    item.originallyAvailableAt.isoformat()
                    if item.originallyAvailableAt
                    else None
                ),
                genres=[g.tag for g in item.genres] if item.genres else [],
                rating=item.rating,
                content_rating=item.contentRating,
                view_count=item.viewCount,
                last_viewed_at=self._parse_datetime(item.lastViewedAt),
            )
        elif isinstance(item, Show):
            return MediaItem(
                rating_key=str(item.ratingKey),
                guid=self._extract_guid(item),
                title=item.title,
                type="show",
                summary=item.summary,
                year=item.year,
                thumb=item.thumb,
                art=item.art,
                duration_ms=item.duration,
                added_at=self._parse_datetime(item.addedAt),
                originally_available_at=(
                    item.originallyAvailableAt.isoformat()
                    if item.originallyAvailableAt
                    else None
                ),
                genres=[g.tag for g in item.genres] if item.genres else [],
                rating=item.rating,
                content_rating=item.contentRating,
                view_count=item.viewCount,
                last_viewed_at=self._parse_datetime(item.lastViewedAt),
                season_count=len(item.seasons()) if hasattr(item, "seasons") else None,
                episode_count=item.leafCount if hasattr(item, "leafCount") else None,
            )
        return None

    def _parse_datetime(self, dt: datetime | None) -> datetime | None:
        """Ensure datetime is timezone-aware."""
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt

    def get_thumbnail_url(self, server_name: str, thumb_path: str) -> str:
        """Get the full thumbnail URL with authentication token."""
        server = self._connect_to_server(server_name)
        # Use the server's token (which works for shared servers) instead of user's plex.tv token
        return f"{server._baseurl}{thumb_path}?X-Plex-Token={server._token}"

    def get_watchlist_status(
        self, server_name: str, rating_key: str
    ) -> WatchlistStatus:
        """Check if an item is on the user's watchlist."""
        server = self._connect_to_server(server_name)
        item = server.fetchItem(int(rating_key))
        on_watchlist = self.account.onWatchlist(item)
        return WatchlistStatus(
            rating_key=rating_key,
            title=item.title,
            on_watchlist=on_watchlist,
        )

    def add_to_watchlist(self, server_name: str, rating_key: str) -> WatchlistStatus:
        """Add an item to the user's watchlist."""
        server = self._connect_to_server(server_name)
        item = server.fetchItem(int(rating_key))
        self.account.addToWatchlist(item)
        return WatchlistStatus(
            rating_key=rating_key,
            title=item.title,
            on_watchlist=True,
        )

    def remove_from_watchlist(
        self, server_name: str, rating_key: str
    ) -> WatchlistStatus:
        """Remove an item from the user's watchlist."""
        server = self._connect_to_server(server_name)
        item = server.fetchItem(int(rating_key))
        self.account.removeFromWatchlist(item)
        return WatchlistStatus(
            rating_key=rating_key,
            title=item.title,
            on_watchlist=False,
        )

    def get_watchlist(self) -> list[WatchlistItem]:
        """Get all items on the user's watchlist."""
        user_id = self._get_user_id()
        cache_key = self.cache._make_key("watchlist", user_id)

        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        items = []
        for item in self.account.watchlist():
            # Watchlist items from discover service - try multiple ways to get a unique ID
            # The 'guid' attribute should be like 'plex://movie/...' or 'plex://show/...'
            guid = None

            # Try direct guid attribute
            if hasattr(item, "guid") and item.guid:
                guid = item.guid

            # Try guids list (external provider IDs)
            if not guid and hasattr(item, "guids") and item.guids:
                # Use the first guid from the list
                guid = item.guids[0].id if item.guids else None

            # Try ratingKey from discover service
            if not guid and hasattr(item, "ratingKey") and item.ratingKey:
                rating_key = str(item.ratingKey)
                if rating_key and rating_key.lower() != "nan":
                    guid = f"plex://{item.type}/{rating_key}"

            # Try key attribute which contains metadata path
            if not guid and hasattr(item, "key") and item.key:
                guid = item.key

            # Last resort fallback
            if not guid:
                guid = f"watchlist:{item.type}:{item.title}:{getattr(item, 'year', 'unknown')}"

            items.append(
                WatchlistItem(
                    guid=guid,
                    title=item.title,
                    type=item.type,
                    year=getattr(item, "year", None),
                    thumb=getattr(item, "thumb", None),
                )
            )

        self.cache.set(cache_key, items)
        return items
