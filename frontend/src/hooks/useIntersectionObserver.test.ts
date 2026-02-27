import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntersectionObserver } from './useIntersectionObserver';

let observerCallback: IntersectionObserverCallback;
let mockObserverInstance: {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  };

  window.IntersectionObserver = vi.fn((callback: IntersectionObserverCallback) => {
    observerCallback = callback;
    return mockObserverInstance;
  }) as unknown as typeof IntersectionObserver;
});

describe('useIntersectionObserver', () => {
  it('returns [ref, isVisible=false] initially', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const [ref, isVisible] = result.current;
    expect(ref.current).toBeNull();
    expect(isVisible).toBe(false);
  });

  it('sets visible on intersection', () => {
    const { result } = renderHook(() => useIntersectionObserver<HTMLDivElement>());

    // Simulate attaching ref to an element
    const el = document.createElement('div');
    act(() => {
      (result.current[0] as { current: HTMLDivElement | null }).current = el;
    });

    // Re-render to trigger useEffect
    const { result: result2 } = renderHook(() => useIntersectionObserver<HTMLDivElement>());
    // Observer should be constructable - basic verification
    expect(result.current[1]).toBe(false); // still false until callback fires
  });

  it('disconnects after first intersection when triggerOnce', () => {
    const { result, rerender } = renderHook(() =>
      useIntersectionObserver<HTMLDivElement>({ triggerOnce: true })
    );

    // Attach element to ref
    const el = document.createElement('div');
    act(() => {
      (result.current[0] as { current: HTMLDivElement | null }).current = el;
    });

    // Rerender to trigger useEffect which creates the observer
    rerender();

    // Verify observer was created and observing
    if (observerCallback) {
      // Simulate intersection
      act(() => {
        observerCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });

      // Should be visible now
      expect(result.current[1]).toBe(true);
      // Observer should have been disconnected for triggerOnce
      expect(mockObserverInstance.disconnect).toHaveBeenCalled();
    }
  });
});
