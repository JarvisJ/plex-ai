import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MediaCard } from './MediaCard';
import type { MediaItem } from '../../api/media';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

vi.mock('./WatchlistModal', () => ({
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

interface SetupOptions {
  item?: MediaItem;
  serverName?: string | null;
  clientIdentifier?: string | null;
}

function setup({ item, serverName, clientIdentifier }: SetupOptions = {}) {
  const resolvedItem = item ?? makeItem();
  mockNavigate.mockReset();
  const renderResult = render(
    <MemoryRouter>
      <MediaCard item={resolvedItem} serverName={serverName} clientIdentifier={clientIdentifier} />
    </MemoryRouter>
  );
  return { item: resolvedItem, mockNavigate, ...renderResult };
}

describe('MediaCard', () => {
  it('renders title, year, and genres', () => {
    setup();

    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
  });

  it('renders content rating', () => {
    setup();
    expect(screen.getByText('PG-13')).toBeInTheDocument();
  });

  it('renders rating as percentage', () => {
    setup({ item: makeItem({ rating: 8.5 }) });
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows No Image when no thumb', () => {
    setup({ item: makeItem({ thumb: null }) });
    expect(screen.getAllByText('No Image').length).toBeGreaterThan(0);
  });

  it('shows Plex link only with clientIdentifier', () => {
    const { rerender } = setup({ serverName: 'Server', clientIdentifier: null });
    expect(screen.queryByText('Watch')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MediaCard item={makeItem()} serverName="Server" clientIdentifier="cid-123" />
      </MemoryRouter>
    );
    expect(screen.getByText('Watch')).toBeInTheDocument();
  });

  it('shows season count for shows', () => {
    setup({ item: makeItem({ type: 'show', season_count: 3 }) });
    expect(screen.getByText('3 seasons')).toBeInTheDocument();
  });

  it('renders duration for movies', () => {
    setup({ item: makeItem({ duration_ms: 7200000 }) });
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });

  it('renders minutes only for short duration', () => {
    setup({ item: makeItem({ duration_ms: 2400000 }) });
    expect(screen.getByText('40m')).toBeInTheDocument();
  });

  it('renders Ask Plexy button when serverName is provided', () => {
    setup({ serverName: 'MyServer' });
    expect(screen.getByText('Ask Plexy')).toBeInTheDocument();
  });

  it('does not render Ask Plexy button when serverName is null', () => {
    setup({ serverName: null });
    expect(screen.queryByText('Ask Plexy')).not.toBeInTheDocument();
  });

  it('navigates to /agent with correct prompt when Ask Plexy is clicked', () => {
    const { mockNavigate } = setup({ serverName: 'MyServer', clientIdentifier: 'cid-123' });

    fireEvent.click(screen.getByText('Ask Plexy'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const navigatedUrl = mockNavigate.mock.calls[0][0] as string;
    expect(navigatedUrl).toContain('/agent?');
    const params = new URLSearchParams(navigatedUrl.split('?')[1]);
    expect(params.get('server')).toBe('MyServer');
    expect(params.get('machine')).toBe('cid-123');
    expect(params.get('prompt')).toContain('Test Movie');
    expect(params.get('prompt')).toContain('2024');
  });
});
