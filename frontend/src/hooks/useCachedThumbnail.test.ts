import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockFetchAndCache: ReturnType<typeof vi.fn>;

vi.mock('../services/thumbnailCache', () => ({
  fetchAndCacheThumbnail: (...args: unknown[]) => mockFetchAndCache(...args),
}));

import { useCachedThumbnail } from './useCachedThumbnail';

beforeEach(() => {
  mockFetchAndCache = vi.fn().mockResolvedValue('blob:http://localhost/thumb');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCachedThumbnail', () => {
  it('returns null src when url is null', () => {
    const { result } = renderHook(() => useCachedThumbnail(null));
    expect(result.current.src).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('does not fetch before 300ms delay', async () => {
    renderHook(() => useCachedThumbnail('/api/media/thumbnail?id=1'));

    // Advance 100ms — not enough
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(mockFetchAndCache).not.toHaveBeenCalled();
  });

  it('fetches after 300ms delay and resolves', async () => {
    const { result } = renderHook(() => useCachedThumbnail('/api/media/thumbnail?id=1'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      // Flush the resolved promise chain
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchAndCache).toHaveBeenCalledOnce();
    expect(result.current.src).toBe('blob:http://localhost/thumb');
    expect(result.current.isLoading).toBe(false);
  });

  it('cancels fetch if unmounted before 300ms delay', async () => {
    const { result, unmount } = renderHook(() =>
      useCachedThumbnail('/api/media/thumbnail?id=2'),
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(mockFetchAndCache).not.toHaveBeenCalled();
    expect(result.current.src).toBeNull();
  });

  it('passes AbortSignal to fetchAndCacheThumbnail', async () => {
    renderHook(() => useCachedThumbnail('/api/media/thumbnail?id=3'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchAndCache).toHaveBeenCalledWith(
      '/api/media/thumbnail?id=3',
      expect.any(AbortSignal),
    );
  });

  it('sets error state on fetch failure', async () => {
    mockFetchAndCache.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCachedThumbnail('/api/media/thumbnail?id=4'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.src).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
