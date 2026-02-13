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
           If `view_count` is 0 or undefined, then the content hasn't been watched.
           If `added_at` is less than 30 days ago, then it's considered recently added.
           `rating` indicates how highly rated the content is. The higher the number the more highly rated it is.



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
        get_media_details,
        get_library_stats,
        web_search,
    ]
