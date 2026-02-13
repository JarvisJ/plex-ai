import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  value: MockResizeObserver,
});

// Mock Element.scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Mock fetch
global.fetch = vi.fn();

// Mock indexedDB
const mockIDBStore: Record<string, unknown> = {};

const createMockStore = () => ({
  get: vi.fn((key: string) => {
    const request = {
      result: mockIDBStore[key] ?? undefined,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
    };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  }),
  put: vi.fn((data: { url: string }) => {
    mockIDBStore[data.url] = data;
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
    };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  }),
  delete: vi.fn((key: string) => {
    delete mockIDBStore[key];
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  }),
  clear: vi.fn(() => {
    Object.keys(mockIDBStore).forEach((k) => delete mockIDBStore[k]);
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  }),
});

const mockDB = {
  transaction: vi.fn(() => ({
    objectStore: vi.fn(() => createMockStore()),
  })),
  objectStoreNames: { contains: vi.fn(() => false) },
  createObjectStore: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', {
  value: {
    open: vi.fn(() => {
      const request = {
        result: mockDB,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as ((event: unknown) => void) | null,
        error: null,
      };
      setTimeout(() => {
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        request.onsuccess?.();
      }, 0);
      return request;
    }),
  },
});
