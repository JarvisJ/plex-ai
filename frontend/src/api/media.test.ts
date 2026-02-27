import { describe, it, expect, vi } from 'vitest';
import {
  getThumbnailUrl,
  getServers,
  getLibraries,
  getLibraryItems,
  clearCache,
  getWatchlist,
  getWatchlistStatus,
  addToWatchlist,
  removeFromWatchlist,
} from './media';

function setup({ token = 'test-token' }: { token?: string } = {}) {
  vi.mocked(fetch).mockReset();
  vi.mocked(localStorage.getItem).mockReturnValue(token);
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as Response);
  return { fetch: vi.mocked(fetch) };
}

describe('getThumbnailUrl', () => {
  it('encodes params and includes token', () => {
    setup({ token: 'my-token' });
    const url = getThumbnailUrl('My Server', '/library/thumb/123');
    expect(url).toContain('server_name=My%20Server');
    expect(url).toContain('path=%2Flibrary%2Fthumb%2F123');
    expect(url).toContain('token=my-token');
  });
});

describe('getServers', () => {
  it('calls correct endpoint', async () => {
    const { fetch } = setup();
    await getServers();
    expect(fetch).toHaveBeenCalledWith('/api/media/servers', expect.anything());
  });
});

describe('getLibraries', () => {
  it('calls with server_name param', async () => {
    const { fetch } = setup();
    await getLibraries('MyServer');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/libraries?server_name=MyServer'),
      expect.anything()
    );
  });
});

describe('getLibraryItems', () => {
  it('calls with pagination params', async () => {
    const { fetch } = setup();
    await getLibraryItems('Server', '1', 10, 25);
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain('offset=10');
    expect(url).toContain('limit=25');
  });
});

describe('clearCache', () => {
  it('calls DELETE', async () => {
    const { fetch } = setup();
    await clearCache();
    expect(fetch).toHaveBeenCalledWith(
      '/api/media/cache',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('getWatchlist', () => {
  it('calls correct endpoint', async () => {
    const { fetch } = setup();
    await getWatchlist();
    expect(fetch).toHaveBeenCalledWith('/api/media/watchlist', expect.anything());
  });
});

describe('getWatchlistStatus', () => {
  it('calls with params', async () => {
    const { fetch } = setup();
    await getWatchlistStatus('Server', '123');
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain('server_name=Server');
    expect(url).toContain('rating_key=123');
  });
});

describe('addToWatchlist', () => {
  it('calls POST', async () => {
    const { fetch } = setup();
    await addToWatchlist('Server', '123');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/watchlist'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('removeFromWatchlist', () => {
  it('calls DELETE', async () => {
    const { fetch } = setup();
    await removeFromWatchlist('Server', '123');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/watchlist'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
