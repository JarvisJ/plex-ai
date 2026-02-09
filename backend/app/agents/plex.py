"""LangChain tools for interacting with the Plex library."""

from datetime import UTC, datetime, timedelta

from langchain_core.tools import tool
from plexapi.server import PlexServer
from plexapi.video import Movie, Show

from app.models.media import MediaItem


def _parse_datetime(dt: datetime | None) -> datetime | None:
    """Ensure datetime is timezone-aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _extract_guid(item: Movie | Show) -> str:
    """Extract a unique guid from a Plex item."""
    if hasattr(item, "guid") and item.guid:
        return item.guid
    item_type = getattr(item, "type", "unknown")
    rating_key = getattr(item, "ratingKey", None)
    if rating_key:
        return f"plex://{item_type}/{rating_key}"
    title = getattr(item, "title", "unknown")
    year = getattr(item, "year", "unknown")
    return f"local://{item_type}/{title}/{year}"


def _convert_to_media_item(item: Movie | Show) -> MediaItem | None:
    """Convert a plexapi item to our MediaItem model."""
    if isinstance(item, Movie):
        return MediaItem(
            rating_key=str(item.ratingKey),
            guid=_extract_guid(item),
            title=item.title,
            type="movie",
            summary=item.summary,
            year=item.year,
            thumb=item.thumb,
            art=item.art,
            duration_ms=item.duration,
            added_at=_parse_datetime(item.addedAt),
            originally_available_at=(
                item.originallyAvailableAt.isoformat() if item.originallyAvailableAt else None
            ),
            genres=[g.tag for g in item.genres] if item.genres else [],
            rating=item.rating,
            content_rating=item.contentRating,
            view_count=item.viewCount,
            last_viewed_at=_parse_datetime(item.lastViewedAt),
        )
    elif isinstance(item, Show):
        return MediaItem(
            rating_key=str(item.ratingKey),
            guid=_extract_guid(item),
            title=item.title,
            type="show",
            summary=item.summary,
            year=item.year,
            thumb=item.thumb,
            art=item.art,
            duration_ms=item.duration,
            added_at=_parse_datetime(item.addedAt),
            originally_available_at=(
                item.originallyAvailableAt.isoformat() if item.originallyAvailableAt else None
            ),
            genres=[g.tag for g in item.genres] if item.genres else [],
            rating=item.rating,
            content_rating=item.contentRating,
            view_count=item.viewCount,
            last_viewed_at=_parse_datetime(item.lastViewedAt),
            season_count=len(item.seasons()) if hasattr(item, "seasons") else None,
            episode_count=item.leafCount if hasattr(item, "leafCount") else None,
        )
    return None


def create_plex_tools(server: PlexServer):
    """Create LangChain tools bound to a specific Plex server."""

    @tool
    def search_library(
        query: str = "",
        media_type: str = "",
        genre: str = "",
    ) -> list[dict]:
        """Search the user's Plex library for movies or TV shows.

        Args:
            query: Search query to match against titles (optional)
            media_type: Filter by type - 'movie' or 'show' (optional)
            genre: Filter by genre like 'Action', 'Comedy', 'Drama' (optional)

        Returns:
            List of matching media items with title, year, genres, rating, and summary
        """
        results = []
        sections = server.library.sections()

        for section in sections:
            if section.type not in ("movie", "show"):
                continue
            if media_type and section.type != media_type:
                continue

            try:
                if query:
                    items = section.search(query)
                elif genre:
                    items = section.search(filters={"genre": genre})
                else:
                    items = section.all(container_size=20)

                for item in items[:20]:  # Limit results
                    if genre and not any(g.tag.lower() == genre.lower() for g in item.genres):
                        continue
                    media_item = _convert_to_media_item(item)
                    if media_item:
                        results.append(media_item.model_dump())
            except Exception:
                continue

        return results[:20]

    @tool
    def get_recommendations(
        based_on: str = "",
        genre: str = "",
        limit: int = 10,
    ) -> list[dict]:
        """Get movie or TV show recommendations from the user's library.

        Args:
            based_on: Title of a movie/show to base recommendations on (optional)
            genre: Genre to filter recommendations by (optional)
            limit: Maximum number of recommendations to return (default 10)

        Returns:
            List of recommended media items
        """
        results = []
        sections = server.library.sections()

        # If based_on is provided, find similar items
        if based_on:
            for section in sections:
                if section.type not in ("movie", "show"):
                    continue
                try:
                    matches = section.search(based_on)
                    if matches:
                        base_item = matches[0]
                        base_genres = {g.tag.lower() for g in base_item.genres}

                        # Find items with similar genres
                        all_items = section.all()
                        for item in all_items:
                            if item.title == base_item.title:
                                continue
                            item_genres = {g.tag.lower() for g in item.genres}
                            if base_genres & item_genres:  # Has overlapping genres
                                media_item = _convert_to_media_item(item)
                                if media_item:
                                    results.append(media_item.model_dump())
                                if len(results) >= limit:
                                    break
                        break
                except Exception:
                    continue
        elif genre:
            # Get items by genre, sorted by rating
            for section in sections:
                if section.type not in ("movie", "show"):
                    continue
                try:
                    items = section.search(filters={"genre": genre})
                    sorted_items = sorted(
                        items, key=lambda x: getattr(x, "rating", 0) or 0, reverse=True
                    )
                    for item in sorted_items[:limit]:
                        media_item = _convert_to_media_item(item)
                        if media_item:
                            results.append(media_item.model_dump())
                except Exception:
                    continue
        else:
            # Get highest rated items
            for section in sections:
                if section.type not in ("movie", "show"):
                    continue
                try:
                    all_items = section.all()
                    sorted_items = sorted(
                        all_items, key=lambda x: getattr(x, "rating", 0) or 0, reverse=True
                    )
                    for item in sorted_items[: limit // 2]:
                        media_item = _convert_to_media_item(item)
                        if media_item:
                            results.append(media_item.model_dump())
                except Exception:
                    continue

        return results[:limit]

    @tool
    def get_unwatched(media_type: str = "", limit: int = 10) -> list[dict]:
        """Find unwatched movies or TV shows in the user's library.

        Args:
            media_type: Filter by 'movie' or 'show' (optional)
            limit: Maximum number of items to return (default 10)

        Returns:
            List of unwatched media items
        """
        results = []
        sections = server.library.sections()

        for section in sections:
            if section.type not in ("movie", "show"):
                continue
            if media_type and section.type != media_type:
                continue

            try:
                # Get unwatched items
                unwatched = section.search(unwatched=True)
                for item in unwatched[:limit]:
                    media_item = _convert_to_media_item(item)
                    if media_item:
                        results.append(media_item.model_dump())
                    if len(results) >= limit:
                        break
            except Exception:
                continue

        return results[:limit]

    @tool
    def get_recently_added(days: int = 30, limit: int = 10) -> list[dict]:
        """Get recently added movies and TV shows.

        Args:
            days: Number of days to look back (default 30)
            limit: Maximum number of items to return (default 10)

        Returns:
            List of recently added media items
        """
        results = []
        cutoff = datetime.now(UTC) - timedelta(days=days)
        sections = server.library.sections()

        all_items = []
        for section in sections:
            if section.type not in ("movie", "show"):
                continue
            try:
                items = section.recentlyAdded()
                for item in items:
                    added_at = _parse_datetime(item.addedAt)
                    if added_at and added_at >= cutoff:
                        media_item = _convert_to_media_item(item)
                        if media_item:
                            all_items.append((added_at, media_item.model_dump()))
            except Exception:
                continue

        # Sort by added date, most recent first
        all_items.sort(key=lambda x: x[0], reverse=True)
        results = [item for _, item in all_items[:limit]]

        return results

    @tool
    def get_media_details(title: str) -> dict:
        """Get detailed information about a specific movie or TV show.

        Args:
            title: The title of the movie or TV show to look up

        Returns:
            Detailed information including summary, genres, rating, etc.
        """
        sections = server.library.sections()

        for section in sections:
            if section.type not in ("movie", "show"):
                continue
            try:
                results = section.search(title)
                if results:
                    item = results[0]
                    media_item = _convert_to_media_item(item)
                    if media_item:
                        return media_item.model_dump()
            except Exception:
                continue

        return {"error": f"Could not find '{title}' in the library"}

    @tool
    def get_library_stats() -> dict:
        """Get statistics about the user's Plex library.

        Returns:
            Dictionary with counts of movies, TV shows, and genres
        """
        stats = {
            "total_movies": 0,
            "total_shows": 0,
            "movie_genres": [],
            "show_genres": [],
        }

        sections = server.library.sections()
        movie_genres = set()
        show_genres = set()

        for section in sections:
            if section.type == "movie":
                stats["total_movies"] += section.totalSize
                try:
                    for item in section.all(container_size=100):
                        for genre in item.genres:
                            movie_genres.add(genre.tag)
                except Exception:
                    pass
            elif section.type == "show":
                stats["total_shows"] += section.totalSize
                try:
                    for item in section.all(container_size=100):
                        for genre in item.genres:
                            show_genres.add(genre.tag)
                except Exception:
                    pass

        stats["movie_genres"] = sorted(movie_genres)
        stats["show_genres"] = sorted(show_genres)

        return stats

    return [
        search_library,
        get_recommendations,
        get_unwatched,
        get_recently_added,
        get_media_details,
        get_library_stats,
    ]
