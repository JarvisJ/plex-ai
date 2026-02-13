"""Tests for app/agents/plex.py - LangChain tools."""

from unittest.mock import MagicMock, patch

from datetime import UTC, datetime

import pytest

from app.agents.plex import create_plex_tools
from app.models.media import MediaItem


def _make_item(**overrides) -> MediaItem:
    defaults = {
        "rating_key": "1",
        "guid": "plex://movie/1",
        "title": "Test Movie",
        "type": "movie",
        "summary": "A test movie",
        "year": 2024,
        "genres": ["Action", "Drama"],
        "rating": 8.0,
        "view_count": 2,
        "added_at": datetime(2024, 6, 1, tzinfo=UTC),
    }
    defaults.update(overrides)
    return MediaItem(**defaults)


@pytest.fixture
def mock_client():
    client = MagicMock()
    client.get_all_library_items.return_value = []
    return client


@pytest.fixture
def tools(mock_client):
    return create_plex_tools(mock_client, "TestServer")


def _get_tool(tools, name):
    for t in tools:
        if t.name == name:
            return t
    raise ValueError(f"Tool {name} not found")


class TestSearchLibrary:
    def test_query_filter(self, mock_client, tools):
        items = [_make_item(title="Inception", rating_key="1"), _make_item(title="Interstellar", rating_key="2")]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "search_library")
        result = tool.invoke({"query": "inception"})
        assert len(result) == 1
        assert result[0]["title"] == "Inception"

    def test_genre_filter(self, mock_client, tools):
        items = [
            _make_item(title="Movie A", rating_key="1", genres=["Comedy"]),
            _make_item(title="Movie B", rating_key="2", genres=["Action"]),
        ]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "search_library")
        result = tool.invoke({"query": "", "genre": "Comedy"})
        assert len(result) == 1
        assert result[0]["title"] == "Movie A"

    def test_combined_filters(self, mock_client, tools):
        items = [
            _make_item(title="Funny Movie", rating_key="1", genres=["Comedy"]),
            _make_item(title="Funny Action", rating_key="2", genres=["Action"]),
        ]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "search_library")
        result = tool.invoke({"query": "funny", "genre": "Comedy"})
        assert len(result) == 1
        assert result[0]["title"] == "Funny Movie"

    def test_no_filters_returns_by_rating(self, mock_client, tools):
        items = [
            _make_item(title="Low", rating_key="1", rating=3.0),
            _make_item(title="High", rating_key="2", rating=9.0),
        ]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "search_library")
        result = tool.invoke({"query": "", "genre": ""})
        assert result[0]["title"] == "High"

    def test_max_300_limit(self, mock_client, tools):
        items = [_make_item(title=f"Movie {i}", rating_key=str(i)) for i in range(400)]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "search_library")
        result = tool.invoke({"query": ""})
        assert len(result) == 300


class TestGetMediaDetails:
    def test_exact_match(self, mock_client, tools):
        items = [
            _make_item(title="Inception", rating_key="1"),
            _make_item(title="The Inception Chronicles", rating_key="2"),
        ]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "get_media_details")
        result = tool.invoke({"title": "Inception"})
        assert result["title"] == "Inception"

    def test_partial_match(self, mock_client, tools):
        items = [_make_item(title="The Dark Knight", rating_key="1")]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "get_media_details")
        result = tool.invoke({"title": "dark knight"})
        assert result["title"] == "The Dark Knight"

    def test_no_match(self, mock_client, tools):
        items = [_make_item(title="Inception", rating_key="1")]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "get_media_details")
        result = tool.invoke({"title": "Nonexistent Movie"})
        assert "error" in result


class TestGetLibraryStats:
    def test_counts_movies_and_shows(self, mock_client, tools):
        items = [
            _make_item(title="Movie 1", rating_key="1", type="movie", genres=["Action"]),
            _make_item(title="Movie 2", rating_key="2", type="movie", genres=["Comedy"]),
            _make_item(title="Show 1", rating_key="3", type="show", genres=["Drama"]),
        ]
        mock_client.get_all_library_items.return_value = items
        tool = _get_tool(tools, "get_library_stats")
        result = tool.invoke({})
        assert result["total_movies"] == 2
        assert result["total_shows"] == 1
        assert "Action" in result["movie_genres"]
        assert "Comedy" in result["movie_genres"]
        assert "Drama" in result["show_genres"]


class TestWebSearch:
    def test_delegates_to_tavily(self, tools):
        tool = _get_tool(tools, "web_search")
        with patch("app.agents.plex.tavily_client") as mock_tavily:
            mock_tavily.search.return_value = {"results": [{"title": "Result"}]}
            result = tool.invoke({"query": "best movies 2024"})
        mock_tavily.search.assert_called_once_with("best movies 2024")
        assert result["results"][0]["title"] == "Result"
