import { describe, it, expect, vi } from 'vitest';
import { ApiError, apiFetch, setAuthToken, clearAuthToken, isAuthenticated } from './client';

describe('ApiError', () => {
  it('sets status and message', () => {
    const error = new ApiError(404, 'Not found');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.name).toBe('ApiError');
  });
});

describe('auth token helpers', () => {
  function setup() {
    localStorage.clear();
    vi.mocked(localStorage.getItem).mockClear();
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
  }

  it('setAuthToken stores token', () => {
    setup();
    setAuthToken('my-token');
    expect(localStorage.setItem).toHaveBeenCalledWith('auth_token', 'my-token');
  });

  it('clearAuthToken removes token', () => {
    setup();
    clearAuthToken();
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
  });

  it('isAuthenticated returns true when token exists', () => {
    setup();
    vi.mocked(localStorage.getItem).mockReturnValue('token');
    expect(isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false when no token', () => {
    setup();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(isAuthenticated()).toBe(false);
  });
});

describe('apiFetch', () => {
  function setup({ token = null }: { token?: string | null } = {}) {
    vi.mocked(fetch).mockReset();
    vi.mocked(localStorage.getItem).mockReturnValue(token);
    return { fetch: vi.mocked(fetch) };
  }

  it('adds Bearer header when authenticated', async () => {
    const { fetch } = setup({ token: 'my-token' });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'ok' }),
    } as Response);

    await apiFetch('/api/test');

    expect(fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('throws 401 when no token and auth required', async () => {
    setup();
    await expect(apiFetch('/api/test')).rejects.toThrow('Not authenticated');
  });

  it('skips auth header when requiresAuth is false', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'ok' }),
    } as Response);

    await apiFetch('/api/test', { requiresAuth: false });

    const callHeaders = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it('returns parsed JSON on success', async () => {
    const { fetch } = setup({ token: 'token' });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'hello' }),
    } as Response);

    const result = await apiFetch('/api/test');
    expect(result).toEqual({ message: 'hello' });
  });

  it('throws ApiError with detail on error response', async () => {
    const { fetch } = setup({ token: 'token' });
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Bad input' }),
    } as Response);

    await expect(apiFetch('/api/test')).rejects.toThrow('Bad input');
  });

  it('throws ApiError with fallback message when no detail', async () => {
    const { fetch } = setup({ token: 'token' });
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(apiFetch('/api/test')).rejects.toThrow('Request failed with status 500');
  });

  it('merges custom headers', async () => {
    const { fetch } = setup({ token: 'token' });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await apiFetch('/api/test', {
      headers: { 'X-Custom': 'value' },
    });

    const callHeaders = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders['X-Custom']).toBe('value');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });
});
