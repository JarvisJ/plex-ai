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

    let cancelled = false;
    let objectUrl: string | null = null;

    const loadThumbnail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        objectUrl = await fetchAndCacheThumbnail(url);
        if (!cancelled) {
          setSrc(objectUrl);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error('Failed to load thumbnail'));
          setSrc(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
      // Revoke the object URL when the component unmounts or URL changes
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return { src, isLoading, error };
}
