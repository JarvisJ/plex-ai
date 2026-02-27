import { describe, it, expect, vi } from 'vitest';
import { createPin, checkPin, exchangeToken, getCurrentUser } from './auth';

function setup({ token = null }: { token?: string | null } = {}) {
  vi.mocked(fetch).mockReset();
  vi.mocked(localStorage.getItem).mockReturnValue(token);
  vi.mocked(localStorage.setItem).mockClear();
  return { fetch: vi.mocked(fetch) };
}

describe('createPin', () => {
  it('calls POST without auth', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, code: 'ABC', auth_url: 'https://plex.tv/auth' }),
    } as Response);

    const result = await createPin();

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/pin',
      expect.objectContaining({ method: 'POST' })
    );
    // No Authorization header
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(result.id).toBe(1);
  });
});

describe('checkPin', () => {
  it('calls GET with params, no auth', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, code: 'ABC', auth_token: null }),
    } as Response);

    await checkPin(1, 'ABC');

    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/auth/pin/1');
    expect(url).toContain('code=ABC');
  });
});

describe('exchangeToken', () => {
  it('calls POST and sets auth token on success', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'jwt-123', token_type: 'bearer' }),
    } as Response);

    const result = await exchangeToken(1, 'ABC');

    expect(result.access_token).toBe('jwt-123');
    expect(localStorage.setItem).toHaveBeenCalledWith('auth_token', 'jwt-123');
  });
});

describe('getCurrentUser', () => {
  it('calls GET with auth', async () => {
    const { fetch } = setup({ token: 'my-token' });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, username: 'test', email: null, thumb: null }),
    } as Response);

    const result = await getCurrentUser();

    expect(result.username).toBe('test');
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-token');
  });
});
