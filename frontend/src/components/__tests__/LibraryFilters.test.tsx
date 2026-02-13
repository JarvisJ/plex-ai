import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryFilters } from '../library/LibraryFilters';
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

const defaultProps = {
  items: [
    makeItem({ rating_key: '1', genres: ['Action', 'Drama'], year: 2024, content_rating: 'PG-13' }),
    makeItem({ rating_key: '2', genres: ['Comedy'], year: 2023, content_rating: 'R' }),
    makeItem({ rating_key: '3', genres: ['Action'], year: 2024, content_rating: 'PG-13' }),
  ],
  searchQuery: '',
  onSearchChange: vi.fn(),
  selectedGenres: new Set<string>(),
  onGenresChange: vi.fn(),
  selectedYears: new Set<number>(),
  onYearsChange: vi.fn(),
  selectedContentRatings: new Set<string>(),
  onContentRatingsChange: vi.fn(),
};

describe('LibraryFilters', () => {
  it('renders search input', () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search title & description...')).toBeInTheDocument();
  });

  it('renders filter buttons', () => {
    render(<LibraryFilters {...defaultProps} />);
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText('Year')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('fires onChange on search input', () => {
    const onSearchChange = vi.fn();
    render(<LibraryFilters {...defaultProps} onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText('Search title & description...');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(onSearchChange).toHaveBeenCalledWith('test');
  });

  it('shows clear button when search has value', () => {
    render(<LibraryFilters {...defaultProps} searchQuery="test" />);
    expect(screen.getByText('×')).toBeInTheDocument();
  });

  it('clear button clears search', () => {
    const onSearchChange = vi.fn();
    render(<LibraryFilters {...defaultProps} searchQuery="test" onSearchChange={onSearchChange} />);

    fireEvent.click(screen.getByText('×'));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('opens dropdown on click', () => {
    render(<LibraryFilters {...defaultProps} />);

    fireEvent.click(screen.getByText('Genre'));

    // Should show genre options
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('shows clear all filters button when filters active', () => {
    render(
      <LibraryFilters
        {...defaultProps}
        selectedGenres={new Set(['Action'])}
      />
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clear all filters resets everything', () => {
    const onSearchChange = vi.fn();
    const onGenresChange = vi.fn();
    const onYearsChange = vi.fn();
    const onContentRatingsChange = vi.fn();

    render(
      <LibraryFilters
        {...defaultProps}
        searchQuery="test"
        onSearchChange={onSearchChange}
        onGenresChange={onGenresChange}
        onYearsChange={onYearsChange}
        onContentRatingsChange={onContentRatingsChange}
      />
    );

    fireEvent.click(screen.getByText('Clear filters'));

    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onGenresChange).toHaveBeenCalledWith(new Set());
    expect(onYearsChange).toHaveBeenCalledWith(new Set());
    expect(onContentRatingsChange).toHaveBeenCalledWith(new Set());
  });
});
