import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryFilters } from './LibraryFilters';
import type { MediaItem } from '../../api/media';

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    rating_key: '1',
    guid: 'plex://movie/1',
    title: 'Test Movie',
    type: 'movie',
    summary: null,
    year: 2024,
    thumb: null,
    art: null,
    duration_ms: null,
    added_at: null,
    originally_available_at: null,
    genres: ['Action'],
    rating: null,
    content_rating: 'PG-13',
    view_count: null,
    last_viewed_at: null,
    season_count: null,
    episode_count: null,
    ...overrides,
  };
}

interface SetupOptions {
  searchQuery?: string;
  selectedGenres?: Set<string>;
  selectedYears?: Set<number>;
  selectedContentRatings?: Set<string>;
}

function setup({
  searchQuery = '',
  selectedGenres = new Set<string>(),
  selectedYears = new Set<number>(),
  selectedContentRatings = new Set<string>(),
}: SetupOptions = {}) {
  const onSearchChange = vi.fn();
  const onGenresChange = vi.fn();
  const onYearsChange = vi.fn();
  const onContentRatingsChange = vi.fn();

  const items = [
    makeItem({ rating_key: '1', genres: ['Action', 'Drama'], year: 2024, content_rating: 'PG-13' }),
    makeItem({ rating_key: '2', genres: ['Comedy'], year: 2023, content_rating: 'R' }),
    makeItem({ rating_key: '3', genres: ['Action'], year: 2024, content_rating: 'PG-13' }),
  ];

  render(
    <LibraryFilters
      items={items}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      selectedGenres={selectedGenres}
      onGenresChange={onGenresChange}
      selectedYears={selectedYears}
      onYearsChange={onYearsChange}
      selectedContentRatings={selectedContentRatings}
      onContentRatingsChange={onContentRatingsChange}
    />
  );

  return { onSearchChange, onGenresChange, onYearsChange, onContentRatingsChange };
}

describe('LibraryFilters', () => {
  it('renders search input', () => {
    setup();
    expect(screen.getByPlaceholderText('Search title & description...')).toBeInTheDocument();
  });

  it('renders filter buttons', () => {
    setup();
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText('Year')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('fires onChange on search input', () => {
    const { onSearchChange } = setup();

    const input = screen.getByPlaceholderText('Search title & description...');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(onSearchChange).toHaveBeenCalledWith('test');
  });

  it('shows clear button when search has value', () => {
    setup({ searchQuery: 'test' });
    expect(screen.getByText('×')).toBeInTheDocument();
  });

  it('clear button clears search', () => {
    const { onSearchChange } = setup({ searchQuery: 'test' });

    fireEvent.click(screen.getByText('×'));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('opens dropdown on click', () => {
    setup();

    fireEvent.click(screen.getByText('Genre'));

    // Should show genre options
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('shows clear all filters button when filters active', () => {
    setup({ selectedGenres: new Set(['Action']) });
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clear all filters resets everything', () => {
    const { onSearchChange, onGenresChange, onYearsChange, onContentRatingsChange } = setup({ searchQuery: 'test' });

    fireEvent.click(screen.getByText('Clear filters'));

    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onGenresChange).toHaveBeenCalledWith(new Set());
    expect(onYearsChange).toHaveBeenCalledWith(new Set());
    expect(onContentRatingsChange).toHaveBeenCalledWith(new Set());
  });
});
