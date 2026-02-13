import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaCard } from '../media/MediaCard';
import type { MediaItem } from '../../api/media';

// Mock dependencies
vi.mock('../../contexts/WatchlistContext', () => ({
  useWatchlist: () => ({
    isOnWatchlist: vi.fn(() => false),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCachedThumbnail', () => ({
  useCachedThumbnail: () => ({ src: null, isLoading: false }),
}));

vi.mock('../../hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => [{ current: null }, false],
}));

vi.mock('../media/WatchlistModal', () => ({
  WatchlistModal: () => null,
}));

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    rating_key: '1',
    guid: 'plex://movie/1',
    title: 'Test Movie',
    type: 'movie',
    summary: 'A great movie',
    year: 2024,
    thumb: '/thumb/1',
    art: null,
    duration_ms: 7200000,
    added_at: null,
    originally_available_at: null,
    genres: ['Action', 'Drama'],
    rating: 8.5,
    content_rating: 'PG-13',
    view_count: null,
    last_viewed_at: null,
    season_count: null,
    episode_count: null,
    ...overrides,
  };
}

describe('MediaCard', () => {
  it('renders title, year, and genres', () => {
    render(<MediaCard item={makeItem()} />);

    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
  });

  it('renders content rating', () => {
    render(<MediaCard item={makeItem()} />);
    expect(screen.getByText('PG-13')).toBeInTheDocument();
  });

  it('renders rating as percentage', () => {
    render(<MediaCard item={makeItem({ rating: 8.5 })} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows No Image when no thumb', () => {
    render(<MediaCard item={makeItem({ thumb: null })} />);
    expect(screen.getAllByText('No Image').length).toBeGreaterThan(0);
  });

  it('shows Plex link only with clientIdentifier', () => {
    const { rerender } = render(
      <MediaCard item={makeItem()} serverName="Server" clientIdentifier={null} />
    );
    expect(screen.queryByText('Watch')).not.toBeInTheDocument();

    rerender(
      <MediaCard item={makeItem()} serverName="Server" clientIdentifier="cid-123" />
    );
    expect(screen.getByText('Watch')).toBeInTheDocument();
  });

  it('shows season count for shows', () => {
    render(
      <MediaCard
        item={makeItem({ type: 'show', season_count: 3 })}
      />
    );
    expect(screen.getByText('3 seasons')).toBeInTheDocument();
  });

  it('renders duration for movies', () => {
    render(<MediaCard item={makeItem({ duration_ms: 7200000 })} />);
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });

  it('renders minutes only for short duration', () => {
    render(<MediaCard item={makeItem({ duration_ms: 2400000 })} />);
    expect(screen.getByText('40m')).toBeInTheDocument();
  });
});
