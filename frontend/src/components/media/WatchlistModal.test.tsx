import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockIsOnWatchlist = vi.fn(() => false);
const mockAddToWatchlist = vi.fn();
const mockRemoveFromWatchlist = vi.fn();

vi.mock('../../contexts/WatchlistContext', () => ({
  useWatchlist: () => ({
    isOnWatchlist: mockIsOnWatchlist,
    addToWatchlist: mockAddToWatchlist,
    removeFromWatchlist: mockRemoveFromWatchlist,
  }),
}));

import { WatchlistModal } from './WatchlistModal';

interface SetupOptions {
  isOpen?: boolean;
  isOnWatchlist?: boolean;
}

function setup({ isOpen = true, isOnWatchlist = false }: SetupOptions = {}) {
  mockIsOnWatchlist.mockReset();
  mockIsOnWatchlist.mockReturnValue(isOnWatchlist);
  mockAddToWatchlist.mockReset();
  mockRemoveFromWatchlist.mockReset();
  const onClose = vi.fn();
  const renderResult = render(
    <WatchlistModal
      isOpen={isOpen}
      onClose={onClose}
      serverName="Server"
      ratingKey="1"
      guid="plex://movie/1"
      title="Test Movie"
    />
  );
  return { onClose, mockAddToWatchlist, mockRemoveFromWatchlist, ...renderResult };
}

describe('WatchlistModal', () => {
  it('returns null when not open', () => {
    const { container } = setup({ isOpen: false });
    expect(container.innerHTML).toBe('');
  });

  it('shows not on watchlist text', () => {
    setup();
    expect(screen.getByText('This item is not on your watchlist.')).toBeInTheDocument();
  });

  it('shows on watchlist text', () => {
    setup({ isOnWatchlist: true });
    expect(screen.getByText('This item is currently on your watchlist.')).toBeInTheDocument();
  });

  it('shows Add button when not on watchlist', () => {
    setup();
    expect(screen.getByText('Add to Watchlist')).toBeInTheDocument();
  });

  it('shows Remove button when on watchlist', () => {
    setup({ isOnWatchlist: true });
    expect(screen.getByText('Remove from Watchlist')).toBeInTheDocument();
  });

  it('calls addToWatchlist when Add button clicked', async () => {
    const { mockAddToWatchlist } = setup();
    mockAddToWatchlist.mockResolvedValue(undefined);

    fireEvent.click(screen.getByText('Add to Watchlist'));
    expect(mockAddToWatchlist).toHaveBeenCalledWith('Server', '1');
  });

  it('calls removeFromWatchlist when Remove button clicked', async () => {
    const { mockRemoveFromWatchlist } = setup({ isOnWatchlist: true });
    mockRemoveFromWatchlist.mockResolvedValue(undefined);

    fireEvent.click(screen.getByText('Remove from Watchlist'));
    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('Server', '1');
  });

  it('renders title', () => {
    setup();
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
  });

  it('renders Close button', () => {
    setup();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
