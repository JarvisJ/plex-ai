import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MediaItem } from '../api/media';

let mockItems: MediaItem[] = [];
const mockIsOnWatchlist = () => false;

vi.mock('../hooks/useMediaItems', () => ({
  useLibraryItems: () => ({
    data: { pages: [{ items: mockItems, total: mockItems.length }] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('../contexts/WatchlistContext', () => ({
  useWatchlist: () => ({
    watchlist: [],
    isOnWatchlist: (guid: string) => mockIsOnWatchlist(guid),
  }),
}));

let capturedItems: MediaItem[] = [];

vi.mock('../components/media/MediaGrid', () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => {
    capturedItems = items;
    return <div data-testid="media-grid" />;
  },
}));

vi.mock('../components/library', () => ({
  LibraryFilters: () => <div />,
}));

function makeItem(overrides: Partial<MediaItem>): MediaItem {
  return {
    rating_key: '1',
    guid: 'plex://movie/1',
    title: 'Test',
    type: 'movie',
    summary: null,
    year: null,
    thumb: null,
    art: null,
    duration_ms: null,
    added_at: null,
    originally_available_at: null,
    genres: [],
    rating: null,
    content_rating: null,
    view_count: null,
    last_viewed_at: null,
    season_count: null,
    episode_count: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/movies/1?server=My+Server&machine=abc']}>
        <Routes>
          <Route path="/movies/:libraryKey" element={
            // Lazy import to pick up fresh mock state each test
            <LibraryPageWrapper />
          } />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Import after mocks are set up
import { LibraryPage } from './LibraryPage';
function LibraryPageWrapper() {
  return <LibraryPage title="Movies" />;
}

// Dates relative to 2026-03-18 (today)
const ONE_MONTH_AGO = '2026-02-18T00:00:00Z';   // within 3 months
const TWO_MONTHS_AGO = '2026-01-18T00:00:00Z';  // within 3 months
const FOUR_MONTHS_AGO = '2025-11-18T00:00:00Z'; // outside 3 months

describe('LibraryPage sorting', () => {
  it('places recently viewed items before unviewed items', () => {
    mockItems = [
      makeItem({ rating_key: '1', title: 'Alpha', last_viewed_at: null }),
      makeItem({ rating_key: '2', title: 'Beta', last_viewed_at: ONE_MONTH_AGO }),
    ];
    renderPage();
    expect(capturedItems[0].title).toBe('Beta');
    expect(capturedItems[1].title).toBe('Alpha');
  });

  it('sorts recently viewed items by last_viewed_at descending', () => {
    mockItems = [
      makeItem({ rating_key: '1', title: 'Older', last_viewed_at: TWO_MONTHS_AGO }),
      makeItem({ rating_key: '2', title: 'Newer', last_viewed_at: ONE_MONTH_AGO }),
    ];
    renderPage();
    expect(capturedItems[0].title).toBe('Newer');
    expect(capturedItems[1].title).toBe('Older');
  });

  it('sorts unviewed items alphabetically', () => {
    mockItems = [
      makeItem({ rating_key: '1', title: 'Zebra', last_viewed_at: null }),
      makeItem({ rating_key: '2', title: 'Apple', last_viewed_at: null }),
      makeItem({ rating_key: '3', title: 'Mango', last_viewed_at: null }),
    ];
    renderPage();
    expect(capturedItems.map((i) => i.title)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('treats items viewed more than 3 months ago as unviewed for sorting', () => {
    mockItems = [
      makeItem({ rating_key: '1', title: 'Zebra', last_viewed_at: FOUR_MONTHS_AGO }),
      makeItem({ rating_key: '2', title: 'Apple', last_viewed_at: null }),
    ];
    renderPage();
    expect(capturedItems.map((i) => i.title)).toEqual(['Apple', 'Zebra']);
  });

  it('combines recently viewed (desc) then alphabetical for the rest', () => {
    mockItems = [
      makeItem({ rating_key: '1', title: 'Zebra', last_viewed_at: null }),
      makeItem({ rating_key: '2', title: 'Recent B', last_viewed_at: TWO_MONTHS_AGO }),
      makeItem({ rating_key: '3', title: 'Apple', last_viewed_at: null }),
      makeItem({ rating_key: '4', title: 'Recent A', last_viewed_at: ONE_MONTH_AGO }),
      makeItem({ rating_key: '5', title: 'Old', last_viewed_at: FOUR_MONTHS_AGO }),
    ];
    renderPage();
    expect(capturedItems.map((i) => i.title)).toEqual([
      'Recent A',
      'Recent B',
      'Apple',
      'Old',
      'Zebra',
    ]);
  });
});
