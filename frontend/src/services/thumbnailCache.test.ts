import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock IndexedDB-dependent functions so fetchAndCacheThumbnail always hits the network path
vi.mock('./thumbnailCache', async (importOriginal) => {
  const original = await importOriginal<typeof import('./thumbnailCache')>();
  return {
    ...original,
    getCachedThumbnail: vi.fn().mockResolvedValue(null),
    cacheThumbnail: vi.fn().mockResolvedValue(undefined),
  };
});

import { fetchAndCacheThumbnail } from './thumbnailCache';

function makeMockResponse(): Response {
  const blob = new Blob(['test'], { type: 'image/jpeg' });
  return {
    ok: true,
    blob: () => Promise.resolve(blob),
  } as Response;
}

describe('thumbnailCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchAndCacheThumbnail concurrency', () => {
    it('limits concurrent fetches to 6', async () => {
      let activeFetches = 0;
      let maxActiveFetches = 0;
      const fetchResolvers: Array<(value: Response) => void> = [];

      global.fetch = vi.fn().mockImplementation(() => {
        activeFetches++;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        return new Promise<Response>((resolve) => {
          fetchResolvers.push((resp: Response) => {
            activeFetches--;
            resolve(resp);
          });
        });
      });

      // Launch 10 requests (more than the limit of 6)
      const promises = Array.from({ length: 10 }, (_, i) =>
        fetchAndCacheThumbnail(`/api/media/thumbnail?id=${i}`),
      );

      // Wait for the first 6 to hit fetch
      await vi.waitFor(() => {
        expect(fetchResolvers.length).toBe(6);
      });

      expect(maxActiveFetches).toBe(6);

      // Resolve the first 6
      for (let i = 0; i < 6; i++) {
        fetchResolvers[i](makeMockResponse());
      }

      // Wait for the remaining 4 to start
      await vi.waitFor(() => {
        expect(fetchResolvers.length).toBe(10);
      });

      // Resolve the remaining 4
      for (let i = 6; i < 10; i++) {
        fetchResolvers[i](makeMockResponse());
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((r) => expect(r).toMatch(/^blob:/));
      expect(maxActiveFetches).toBe(6);
    });

    it('cancels queued requests when signal is aborted', async () => {
      const fetchResolvers: Array<(value: Response) => void> = [];

      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise<Response>((resolve) => {
          fetchResolvers.push(resolve);
        });
      });

      // Fill up all 6 slots
      const fillerPromises = Array.from({ length: 6 }, (_, i) =>
        fetchAndCacheThumbnail(`/api/media/thumbnail?filler=${i}`),
      );

      await vi.waitFor(() => {
        expect(fetchResolvers.length).toBe(6);
      });

      // Queue a request with an abort controller
      const controller = new AbortController();
      const abortablePromise = fetchAndCacheThumbnail(
        '/api/media/thumbnail?abortme=1',
        controller.signal,
      );

      // Abort while still queued (no slot available)
      controller.abort();

      // Should reject with AbortError
      await expect(abortablePromise).rejects.toThrow('Aborted');

      // Resolve fillers to clean up
      for (let i = 0; i < 6; i++) {
        fetchResolvers[i](makeMockResponse());
      }
      await Promise.all(fillerPromises);
    });

    it('passes abort signal to fetch for in-flight requests', async () => {
      const fetchCalls: Array<{ url: string; signal?: AbortSignal }> = [];

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        fetchCalls.push({ url, signal: opts?.signal });
        return Promise.resolve(makeMockResponse());
      });

      const controller = new AbortController();
      await fetchAndCacheThumbnail('/api/media/thumbnail?signal=1', controller.signal);

      const call = fetchCalls.find((c) => c.url === '/api/media/thumbnail?signal=1');
      expect(call).toBeDefined();
      expect(call?.signal).toBe(controller.signal);
    });
  });
});
