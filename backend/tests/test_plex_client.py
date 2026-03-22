from datetime import UTC, datetime
from unittest.mock import MagicMock, PropertyMock, patch

import pytest

from app.config import Settings
from app.models.media import MediaItem, PaginatedResponse, Server, WatchlistItem, WatchlistStatus
from app.services.cache import CacheService
from app.services.plex_client import PlexClientService


@pytest.fixture
def plex_settings():
    return Settings(
        session_secret_key="test-secret",
        redis_url="redis://localhost:6379/0",
    )


@pytest.fixture
def plex_client(plex_settings, mock_cache):
    client = PlexClientService("test-token", plex_settings, mock_cache)
    client._account = MagicMock()
    client._account.id = 123
    return client


def _make_mock_movie(**overrides):
    from plexapi.video import Movie

    movie = MagicMock(spec=Movie)
    movie.ratingKey = overrides.get("ratingKey", 1001)
    movie.guid = overrides.get("guid", "plex://movie/abc")
    movie.title = overrides.get("title", "Test Movie")
    movie.type = "movie"
    movie.summary = overrides.get("summary", "A test movie")
    movie.year = overrides.get("year", 2024)
    movie.thumb = overrides.get("thumb", "/library/thumb/1001")
    movie.art = overrides.get("art", "/library/art/1001")
    movie.duration = overrides.get("duration", 7200000)
    movie.addedAt = overrides.get("addedAt", datetime(2024, 1, 1, tzinfo=UTC))
    movie.originallyAvailableAt = overrides.get("originallyAvailableAt", datetime(2024, 6, 15))
    movie.genres = overrides.get("genres", [MagicMock(tag="Action"), MagicMock(tag="Drama")])
    movie.rating = overrides.get("rating", 8.5)
    movie.contentRating = overrides.get("contentRating", "PG-13")
    movie.viewCount = overrides.get("viewCount", 2)
    movie.lastViewedAt = overrides.get("lastViewedAt", None)
    # Make isinstance check work
    movie.__class__ = Movie
    return movie


def _make_mock_show(**overrides):
    from plexapi.video import Show

    show = MagicMock(spec=Show)
    show.ratingKey = overrides.get("ratingKey", 2001)
    show.guid = overrides.get("guid", "plex://show/xyz")
    show.title = overrides.get("title", "Test Show")
    show.type = "show"
    show.summary = overrides.get("summary", "A test show")
    show.year = overrides.get("year", 2023)
    show.thumb = overrides.get("thumb", "/library/thumb/2001")
    show.art = overrides.get("art", "/library/art/2001")
    show.duration = overrides.get("duration", 3600000)
    show.addedAt = overrides.get("addedAt", datetime(2024, 2, 1, tzinfo=UTC))
    show.originallyAvailableAt = overrides.get("originallyAvailableAt", None)
    show.genres = overrides.get("genres", [MagicMock(tag="Comedy")])
    show.rating = overrides.get("rating", 7.5)
    show.contentRating = overrides.get("contentRating", "TV-14")
    show.viewCount = overrides.get("viewCount", 0)
    show.lastViewedAt = overrides.get("lastViewedAt", None)
    show.leafCount = overrides.get("leafCount", 24)
    show.seasons.return_value = [MagicMock(), MagicMock()]
    show.__class__ = Show
    return show


class TestAccountProperty:
    def test_lazy_creation(self, plex_settings, mock_cache):
        client = PlexClientService("test-token", plex_settings, mock_cache)
        client._account = None
        with patch("app.services.plex_client.MyPlexAccount") as mock_account_cls:
            mock_account_cls.return_value = MagicMock(id=42)
            acc = client.account
            mock_account_cls.assert_called_once_with(token="test-token", timeout=60)

    def test_reuse(self, plex_client):
        acc1 = plex_client.account
        acc2 = plex_client.account
        assert acc1 is acc2


class TestGetServers:
    def test_cache_hit(self, plex_client, mock_cache, mock_redis):
        mock_redis.get.return_value = '[{"name":"srv","address":"1.2.3.4","port":32400,"scheme":"https","local":false,"owned":true,"client_identifier":"cid"}]'
        result = plex_client.get_servers()
        assert result == [{"name": "srv", "address": "1.2.3.4", "port": 32400, "scheme": "https", "local": False, "owned": True, "client_identifier": "cid"}]

    def test_cache_miss_filters_local(self, plex_client, mock_cache, mock_redis):
        mock_redis.get.return_value = None

        # Create mock connections with spec=[] to avoid MagicMock attribute confusion
        local_conn = MagicMock(spec=[])
        local_conn.local = True
        local_conn.address = "192.168.1.1"
        local_conn.port = 32400
        local_conn.protocol = "http"

        remote_conn = MagicMock(spec=[])
        remote_conn.local = False
        remote_conn.address = "1.2.3.4"
        remote_conn.port = 32400
        remote_conn.protocol = "https"

        resource = MagicMock(spec=[])
        resource.product = "Plex Media Server"
        resource.name = "MyServer"
        resource.connections = [local_conn, remote_conn]
        resource.owned = True
        resource.clientIdentifier = "cid-123"

        plex_client._account.resources.return_value = [resource]

        result = plex_client.get_servers()
        assert len(result) == 1
        assert result[0].name == "MyServer"
        assert result[0].local is False


class TestGetLibraries:
    def test_cache_hit(self, plex_client, mock_redis):
        mock_redis.get.return_value = '[{"key":"1","title":"Movies","type":"movie"}]'
        result = plex_client.get_libraries("MyServer")
        assert result == [{"key": "1", "title": "Movies", "type": "movie"}]

    def test_cache_miss_filters_types(self, plex_client, mock_redis):
        mock_redis.get.return_value = None

        mock_server = MagicMock()
        movie_section = MagicMock(key=1, title="Movies", type="movie", agent="agent", scanner="scanner", thumb="/thumb", totalSize=100)
        show_section = MagicMock(key=2, title="TV", type="show", agent="agent", scanner="scanner", thumb=None, totalSize=50)
        music_section = MagicMock(key=3, title="Music", type="artist", agent="agent", scanner="scanner", thumb=None, totalSize=200)
        mock_server.library.sections.return_value = [movie_section, show_section, music_section]

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.get_libraries("MyServer")

        assert len(result) == 2
        assert result[0].title == "Movies"
        assert result[1].title == "TV"


class TestGetLibraryItems:
    def test_cache_hit(self, plex_client, mock_redis):
        mock_redis.get.return_value = '{"items":[],"total":0,"offset":0,"limit":50,"has_more":false}'
        result = plex_client.get_library_items("MyServer", "1")
        assert result == {"items": [], "total": 0, "offset": 0, "limit": 50, "has_more": False}

    def test_cache_miss_with_pagination(self, plex_client, mock_redis):
        mock_redis.get.return_value = None

        mock_server = MagicMock()
        section = MagicMock(totalSize=100)
        movie = _make_mock_movie()
        section.all.return_value = [movie]
        mock_server.library.sectionByID.return_value = section

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.get_library_items("MyServer", "1", offset=0, limit=50)

        assert isinstance(result, PaginatedResponse)
        assert len(result.items) == 1
        assert result.total == 100
        assert result.has_more is True


class TestExtractGuid:
    def test_has_guid(self, plex_client):
        item = MagicMock()
        item.guid = "plex://movie/abc"
        assert plex_client._extract_guid(item) == "plex://movie/abc"

    def test_has_rating_key(self, plex_client):
        item = MagicMock(spec=[])
        item.guid = None
        item.type = "movie"
        item.ratingKey = 12345
        # hasattr for guid returns True since we set it, but it's None
        result = plex_client._extract_guid(item)
        assert result == "plex://movie/12345"

    def test_fallback_to_title(self, plex_client):
        item = MagicMock(spec=[])
        item.guid = None
        item.type = "movie"
        item.ratingKey = None
        item.title = "Inception"
        item.year = 2010
        result = plex_client._extract_guid(item)
        assert result == "local://movie/Inception/2010"


class TestConvertToMediaItem:
    def test_movie_conversion(self, plex_client):
        movie = _make_mock_movie()
        result = plex_client._convert_to_media_item(movie)
        assert result is not None
        assert result.type == "movie"
        assert result.title == "Test Movie"
        assert result.year == 2024
        assert "Action" in result.genres

    def test_show_conversion(self, plex_client):
        show = _make_mock_show()
        result = plex_client._convert_to_media_item(show)
        assert result is not None
        assert result.type == "show"
        assert result.title == "Test Show"
        assert result.season_count == 2
        assert result.episode_count == 24

    def test_unknown_type(self, plex_client):
        unknown = MagicMock()
        unknown.__class__ = type("Episode", (), {})
        result = plex_client._convert_to_media_item(unknown)
        assert result is None


class TestParseDatetime:
    def test_none_input(self, plex_client):
        assert plex_client._parse_datetime(None) is None

    def test_naive_datetime(self, plex_client):
        dt = datetime(2024, 1, 1)
        result = plex_client._parse_datetime(dt)
        assert result.tzinfo == UTC

    def test_timezone_aware(self, plex_client):
        dt = datetime(2024, 1, 1, tzinfo=UTC)
        result = plex_client._parse_datetime(dt)
        assert result is dt


class TestGetThumbnailUrl:
    def test_returns_url_with_token(self, plex_client):
        mock_server = MagicMock()
        mock_server._baseurl = "https://plex.example.com:32400"
        mock_server._token = "server-token"
        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            url = plex_client.get_thumbnail_url("MyServer", "/library/thumb/1001")
        assert url == "https://plex.example.com:32400/library/thumb/1001?X-Plex-Token=server-token"


class TestWatchlistMethods:
    def test_get_watchlist_status(self, plex_client):
        mock_server = MagicMock()
        mock_item = MagicMock(title="Test Movie")
        mock_server.fetchItem.return_value = mock_item
        plex_client._account.onWatchlist.return_value = True

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.get_watchlist_status("MyServer", "1001")

        assert isinstance(result, WatchlistStatus)
        assert result.on_watchlist is True
        assert result.title == "Test Movie"

    def test_add_to_watchlist(self, plex_client):
        mock_server = MagicMock()
        mock_item = MagicMock(title="Test Movie")
        mock_server.fetchItem.return_value = mock_item

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.add_to_watchlist("MyServer", "1001")

        plex_client._account.addToWatchlist.assert_called_once_with(mock_item)
        assert result.on_watchlist is True

    def test_remove_from_watchlist(self, plex_client):
        mock_server = MagicMock()
        mock_item = MagicMock(title="Test Movie")
        mock_server.fetchItem.return_value = mock_item

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.remove_from_watchlist("MyServer", "1001")

        plex_client._account.removeFromWatchlist.assert_called_once_with(mock_item)
        assert result.on_watchlist is False


class TestGetWatchlist:
    def _make_watchlist_item(self, **kwargs):
        item = MagicMock()
        item.guid = kwargs.get("guid", None)
        item.guids = kwargs.get("guids", [])
        item.ratingKey = kwargs.get("ratingKey", None)
        item.key = kwargs.get("key", None)
        item.title = kwargs.get("title", "Test")
        item.type = kwargs.get("type", "movie")
        item.year = kwargs.get("year", 2024)
        item.thumb = kwargs.get("thumb", None)
        return item

    def test_with_guid(self, plex_client, mock_redis):
        mock_redis.get.return_value = None
        item = self._make_watchlist_item(guid="plex://movie/abc")
        plex_client._account.watchlist.return_value = [item]

        result = plex_client.get_watchlist()
        assert len(result) == 1
        assert result[0].guid == "plex://movie/abc"

    def test_with_guids_list(self, plex_client, mock_redis):
        mock_redis.get.return_value = None
        guid_obj = MagicMock()
        guid_obj.id = "imdb://tt1234567"
        item = self._make_watchlist_item(guid=None, guids=[guid_obj])
        plex_client._account.watchlist.return_value = [item]

        result = plex_client.get_watchlist()
        assert result[0].guid == "imdb://tt1234567"

    def test_with_rating_key(self, plex_client, mock_redis):
        mock_redis.get.return_value = None
        item = self._make_watchlist_item(guid=None, guids=[], ratingKey="5678")
        plex_client._account.watchlist.return_value = [item]

        result = plex_client.get_watchlist()
        assert "5678" in result[0].guid

    def test_nan_rating_key(self, plex_client, mock_redis):
        mock_redis.get.return_value = None
        item = self._make_watchlist_item(guid=None, guids=[], ratingKey="nan", key="/metadata/123")
        plex_client._account.watchlist.return_value = [item]

        result = plex_client.get_watchlist()
        assert result[0].guid == "/metadata/123"

    def test_title_fallback(self, plex_client, mock_redis):
        mock_redis.get.return_value = None
        item = self._make_watchlist_item(guid=None, guids=[], ratingKey=None, key=None, title="Fallback Movie")
        plex_client._account.watchlist.return_value = [item]

        result = plex_client.get_watchlist()
        assert "Fallback Movie" in result[0].guid


class TestGetAllLibraryItems:
    def test_cache_hit(self, plex_client, mock_redis):
        cached_data = [{"rating_key": "1", "guid": "plex://movie/1", "title": "Cached", "type": "movie"}]
        mock_redis.get.return_value = __import__("json").dumps(cached_data)

        result = plex_client.get_all_library_items("MyServer")
        assert len(result) == 1
        assert isinstance(result[0], MediaItem)

    def test_cache_miss(self, plex_client, mock_redis):
        mock_redis.get.return_value = None

        mock_server = MagicMock()
        section = MagicMock(type="movie")
        movie = _make_mock_movie()
        section.all.return_value = [movie]
        mock_server.library.sections.return_value = [section]

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.get_all_library_items("MyServer")

        assert len(result) == 1
        assert result[0].title == "Test Movie"

    def test_media_type_filter(self, plex_client, mock_redis):
        mock_redis.get.return_value = None

        mock_server = MagicMock()
        movie_section = MagicMock(type="movie")
        movie_section.all.return_value = [_make_mock_movie()]
        show_section = MagicMock(type="show")
        show_section.all.return_value = [_make_mock_show()]
        mock_server.library.sections.return_value = [movie_section, show_section]

        with patch.object(plex_client, "_connect_to_server", return_value=mock_server):
            result = plex_client.get_all_library_items("MyServer", media_type="movie")

        assert all(item.type == "movie" for item in result)
