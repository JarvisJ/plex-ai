import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedThumbnail,
  cacheThumbnail,
  deleteCachedThumbnail,
  clearThumbnailCache,
  fetchAndCacheThumbnail,
} from '../thumbnailCache';

describe('getCachedThumbnail', () => {
  it('returns null on cache miss', async () => {
    const result = await getCachedThumbnail('http://example.com/thumb.jpg');
    expect(result).toBeNull();
  });
});

describe('cacheThumbnail', () => {
  it('stores data without throwing', async () => {
    const blob = new Blob(['test'], { type: 'image/jpeg' });
    await expect(cacheThumbnail('http://example.com/thumb.jpg', blob)).resolves.not.toThrow();
  });
});

describe('deleteCachedThumbnail', () => {
  it('deletes without throwing', async () => {
    await expect(deleteCachedThumbnail('http://example.com/thumb.jpg')).resolves.not.toThrow();
  });
});

describe('clearThumbnailCache', () => {
  it('clears without throwing', async () => {
    await expect(clearThumbnailCache()).resolves.not.toThrow();
  });
});

describe('fetchAndCacheThumbnail', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('fetches and returns object URL on cache miss', async () => {
    const blob = new Blob(['image'], { type: 'image/jpeg' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => blob,
    } as Response);

    const result = await fetchAndCacheThumbnail('http://example.com/thumb.jpg');

    expect(result).toBe('blob:mock-url');
    expect(fetch).toHaveBeenCalledWith('http://example.com/thumb.jpg');
  });

  it('throws on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchAndCacheThumbnail('http://example.com/404.jpg')).rejects.toThrow(
      'Failed to fetch thumbnail'
    );
  });
});
