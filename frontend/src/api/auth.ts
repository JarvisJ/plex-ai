import { apiFetch, setAuthToken } from './client';

export interface PinResponse {
  id: number;
  code: string;
  auth_url: string;
  expires_at: string | null;
  auth_token: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string | null;
  thumb: string | null;
  client_identifier: string | null;
}

export async function createPin(): Promise<PinResponse> {
  return apiFetch<PinResponse>('/api/auth/pin', {
    method: 'POST',
    requiresAuth: false,
  });
}

export async function checkPin(pinId: number, code: string): Promise<PinResponse> {
  return apiFetch<PinResponse>(`/api/auth/pin/${pinId}?code=${encodeURIComponent(code)}`, {
    requiresAuth: false,
  });
}

export async function exchangeToken(pinId: number, code: string): Promise<TokenResponse> {
  const response = await apiFetch<TokenResponse>(
    `/api/auth/token?pin_id=${pinId}&code=${encodeURIComponent(code)}`,
    {
      method: 'POST',
      requiresAuth: false,
    }
  );
  setAuthToken(response.access_token);
  return response;
}

export async function getCurrentUser(): Promise<UserInfo> {
  return apiFetch<UserInfo>('/api/auth/me');
}
