const DB_NAME = 'plex-thumbnails';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedThumbnail {
  url: string;
  blob: Blob;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });

  return dbPromise;
}

export async function getCachedThumbnail(url: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedThumbnail | undefined;
        if (result) {
          // Check if cache is still valid
          if (Date.now() - result.timestamp < MAX_AGE_MS) {
            resolve(URL.createObjectURL(result.blob));
          } else {
            // Cache expired, delete it
            deleteCachedThumbnail(url);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function cacheThumbnail(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const data: CachedThumbnail = {
        url,
        blob,
        timestamp: Date.now(),
      };

      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail - caching is optional
  }
}

export async function deleteCachedThumbnail(url: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(url);
      resolve();
    });
  } catch {
    // Silently fail
  }
}

export async function clearThumbnailCache(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      resolve();
    });
  } catch {
    // Silently fail
  }
}

const MAX_CONCURRENT_FETCHES = 6;
let activeFetches = 0;
const fetchQueue: Array<{ resolve: () => void; signal?: AbortSignal }> = [];

function releaseFetchSlot(): void {
  activeFetches--;
  const next = fetchQueue.shift();
  if (next) {
    activeFetches++;
    next.resolve();
  }
}

function acquireFetchSlot(signal?: AbortSignal): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const entry = { resolve, signal };
    fetchQueue.push(entry);

    if (signal) {
      const onAbort = () => {
        const index = fetchQueue.indexOf(entry);
        if (index !== -1) {
          fetchQueue.splice(index, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function fetchAndCacheThumbnail(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  // Check cache first
  const cached = await getCachedThumbnail(url);
  if (cached) {
    return cached;
  }

  // Wait for a fetch slot (respects abort signal while queued)
  await acquireFetchSlot(signal);

  try {
    // Fetch from server
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }

    const blob = await response.blob();

    // Cache the blob
    await cacheThumbnail(url, blob);

    // Return object URL
    return URL.createObjectURL(blob);
  } finally {
    releaseFetchSlot();
  }
}
