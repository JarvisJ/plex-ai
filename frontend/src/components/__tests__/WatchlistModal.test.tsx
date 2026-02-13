import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { WatchlistModal } from '../media/WatchlistModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  serverName: 'Server',
  ratingKey: '1',
  guid: 'plex://movie/1',
  title: 'Test Movie',
};

beforeEach(() => {
  mockIsOnWatchlist.mockReturnValue(false);
  mockAddToWatchlist.mockReset();
  mockRemoveFromWatchlist.mockReset();
  defaultProps.onClose = vi.fn();
});

describe('WatchlistModal', () => {
  it('returns null when not open', () => {
    const { container } = render(<WatchlistModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows not on watchlist text', () => {
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('This item is not on your watchlist.')).toBeInTheDocument();
  });

  it('shows on watchlist text', () => {
    mockIsOnWatchlist.mockReturnValue(true);
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('This item is currently on your watchlist.')).toBeInTheDocument();
  });

  it('shows Add button when not on watchlist', () => {
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('Add to Watchlist')).toBeInTheDocument();
  });

  it('shows Remove button when on watchlist', () => {
    mockIsOnWatchlist.mockReturnValue(true);
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('Remove from Watchlist')).toBeInTheDocument();
  });

  it('calls addToWatchlist when Add button clicked', async () => {
    mockAddToWatchlist.mockResolvedValue(undefined);
    render(<WatchlistModal {...defaultProps} />);

    fireEvent.click(screen.getByText('Add to Watchlist'));
    expect(mockAddToWatchlist).toHaveBeenCalledWith('Server', '1');
  });

  it('calls removeFromWatchlist when Remove button clicked', async () => {
    mockIsOnWatchlist.mockReturnValue(true);
    mockRemoveFromWatchlist.mockResolvedValue(undefined);
    render(<WatchlistModal {...defaultProps} />);

    fireEvent.click(screen.getByText('Remove from Watchlist'));
    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('Server', '1');
  });

  it('renders title', () => {
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
  });

  it('renders Close button', () => {
    render(<WatchlistModal {...defaultProps} />);
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
