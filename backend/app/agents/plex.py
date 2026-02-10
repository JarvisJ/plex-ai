"""LangChain tools for interacting with the Plex library.

These tools use the PlexClientService which provides caching for better performance.
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool
from tavily import TavilyClient
from dotenv import load_dotenv

if TYPE_CHECKING:
    from app.services.plex_client import PlexClientService

# Load environment variables from .env file
load_dotenv()

tavily_client = TavilyClient()


def create_plex_tools(client: "PlexClientService", server_name: str):
    """Create LangChain tools bound to a specific Plex server.

    Uses PlexClientService for caching - all library data is cached for performance.
    """

    def _get_cached_items(media_type: str | None = None) -> list[dict]:
        """Get all library items from cache."""
        items = client.get_all_library_items(server_name, media_type)
        return [item.model_dump() for item in items]

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
        # Get cached items
        all_items = _get_cached_items(media_type if media_type else None)
        all_items.sort(key=lambda x: x.get("rating") or 0, reverse=True)

        print(f"Count from cache for media type {media_type}: {len(all_items)}")

        results = []
        query_lower = query.lower() if query else ""
        genre_lower = genre.lower() if genre else ""

        for item in all_items:
            # Filter by query (title match)
            if query_lower and query_lower not in item.get("title", "").lower():
                continue

            # Filter by genre
            if genre_lower:
                item_genres = [g.lower() for g in item.get("genres", [])]
                if genre_lower not in item_genres:
                    continue

            results.append(item)

            if len(results) >= 300:
                break

        print(f"Returning from search_library {len(all_items)} items")

        return results

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
        all_items = _get_cached_items()
        results = []

        if based_on:
            # Find the base item
            base_item = None
            based_on_lower = based_on.lower()
            for item in all_items:
                if based_on_lower in item.get("title", "").lower():
                    base_item = item
                    break

            if base_item:
                base_genres = {g.lower() for g in base_item.get("genres", [])}
                base_type = base_item.get("type")

                # Find items with similar genres
                for item in all_items:
                    if item.get("title") == base_item.get("title"):
                        continue
                    if base_type and item.get("type") != base_type:
                        continue

                    item_genres = {g.lower() for g in item.get("genres", [])}
                    if base_genres & item_genres:
                        results.append(item)
                        if len(results) >= limit:
                            break

        elif genre:
            # Get items by genre, sorted by rating
            genre_lower = genre.lower()
            matching = []
            for item in all_items:
                item_genres = [g.lower() for g in item.get("genres", [])]
                if genre_lower in item_genres:
                    matching.append(item)

            # Sort by rating
            matching.sort(key=lambda x: x.get("rating") or 0, reverse=True)
            results = matching[:limit]

        else:
            # Get highest rated items
            sorted_items = sorted(
                all_items,
                key=lambda x: x.get("rating") or 0,
                reverse=True,
            )
            results = sorted_items[:limit]

        return results

    @tool
    def get_unwatched(media_type: str = "", limit: int = 10) -> list[dict]:
        """Find unwatched movies or TV shows in the user's library.

        Args:
            media_type: Filter by 'movie' or 'show' (optional)
            limit: Maximum number of items to return (default 10)

        Returns:
            List of unwatched media items
        """
        all_items = _get_cached_items(media_type if media_type else None)

        results = []
        for item in all_items:
            # Check if unwatched (view_count is None or 0)
            if not item.get("view_count"):
                results.append(item)
                if len(results) >= limit:
                    break

        return results

    @tool
    def get_recently_added(days: int = 30, limit: int = 10) -> list[dict]:
        """Get recently added movies and TV shows.

        Args:
            days: Number of days to look back (default 30)
            limit: Maximum number of items to return (default 10)

        Returns:
            List of recently added media items
        """
        all_items = _get_cached_items()
        cutoff = datetime.now(UTC) - timedelta(days=days)

        recent = []
        for item in all_items:
            added_at_str = item.get("added_at")
            if added_at_str:
                try:
                    if isinstance(added_at_str, str):
                        added_at = datetime.fromisoformat(
                            added_at_str.replace("Z", "+00:00")
                        )
                    else:
                        added_at = added_at_str
                    if added_at >= cutoff:
                        recent.append((added_at, item))
                except (ValueError, TypeError):
                    continue

        # Sort by added date, most recent first
        recent.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in recent[:limit]]

    @tool
    def get_media_details(title: str) -> dict:
        """Get detailed information about a specific movie or TV show.

        Args:
            title: The title of the movie or TV show to look up

        Returns:
            Detailed information including summary, genres, rating, etc.
        """
        all_items = _get_cached_items()
        title_lower = title.lower()

        # Try exact match first
        for item in all_items:
            if item.get("title", "").lower() == title_lower:
                return item

        # Try partial match
        for item in all_items:
            if title_lower in item.get("title", "").lower():
                return item

        return {"error": f"Could not find '{title}' in the library"}

    @tool
    def web_search(query: str) -> dict[str, Any]:
        """Search the web for information about movies, TV shows, actors, etc."""
        return tavily_client.search(query)

    @tool
    def get_library_stats() -> dict:
        """Get statistics about the user's Plex library.

        Returns:
            Dictionary with counts of movies, TV shows, and genres
        """
        all_items = _get_cached_items()

        stats: dict[str, Any] = {
            "total_movies": 0,
            "total_shows": 0,
            "movie_genres": set(),
            "show_genres": set(),
        }

        for item in all_items:
            item_type = item.get("type")
            genres = item.get("genres", [])

            if item_type == "movie":
                stats["total_movies"] += 1
                for genre in genres:
                    stats["movie_genres"].add(genre)
            elif item_type == "show":
                stats["total_shows"] += 1
                for genre in genres:
                    stats["show_genres"].add(genre)

        # Convert sets to sorted lists
        stats["movie_genres"] = sorted(stats["movie_genres"])
        stats["show_genres"] = sorted(stats["show_genres"])

        return stats

    return [
        search_library,
        get_recommendations,
        get_unwatched,
        get_recently_added,
        get_media_details,
        get_library_stats,
        web_search,
    ]
