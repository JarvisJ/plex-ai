import { useState, useEffect } from 'react';
import { fetchAndCacheThumbnail } from '../services/thumbnailCache';

export function useCachedThumbnail(url: string | null): {
  src: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    const loadThumbnail = async () => {
      // Wait 150ms before fetching — if the component unmounts (e.g. scrolled
      // past) the abort will cancel before the request is ever made.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 300);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });

      setIsLoading(true);
      setError(null);

      try {
        objectUrl = await fetchAndCacheThumbnail(url, controller.signal);
        if (!controller.signal.aborted) {
          setSrc(objectUrl);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e : new Error('Failed to load thumbnail'));
          setSrc(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadThumbnail().catch(() => {
      // AbortError from the delay is expected — suppress
    });

    return () => {
      controller.abort();
      // Revoke the object URL when the component unmounts or URL changes
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return { src, isLoading, error };
}
