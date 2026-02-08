import { apiFetch } from './client';

export interface Server {
  name: string;
  address: string;
  port: number;
  scheme: string;
  local: boolean;
  owned: boolean;
  client_identifier: string;
}

export interface Library {
  key: string;
  title: string;
  type: string;
  agent: string | null;
  scanner: string | null;
  thumb: string | null;
  count: number | null;
}

export interface MediaItem {
  rating_key: string;
  guid: string;
  title: string;
  type: string;
  summary: string | null;
  year: number | null;
  thumb: string | null;
  art: string | null;
  duration_ms: number | null;
  added_at: string | null;
  originally_available_at: string | null;
  genres: string[];
  rating: number | null;
  content_rating: string | null;
  view_count: number | null;
  last_viewed_at: string | null;
  season_count: number | null;
  episode_count: number | null;
}

export interface PaginatedResponse {
  items: MediaItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export function getThumbnailUrl(serverName: string, thumbPath: string): string {
  const token = localStorage.getItem('auth_token');
  return `http://localhost:8000/api/media/thumbnail?server_name=${encodeURIComponent(serverName)}&path=${encodeURIComponent(thumbPath)}&token=${encodeURIComponent(token || '')}`;
}

export async function getServers(): Promise<Server[]> {
  return apiFetch<Server[]>('/api/media/servers');
}

export async function getLibraries(serverName: string): Promise<Library[]> {
  return apiFetch<Library[]>(
    `/api/media/libraries?server_name=${encodeURIComponent(serverName)}`
  );
}

export async function getLibraryItems(
  serverName: string,
  libraryKey: string,
  offset: number = 0,
  limit: number = 50
): Promise<PaginatedResponse> {
  return apiFetch<PaginatedResponse>(
    `/api/media/libraries/${libraryKey}/items?server_name=${encodeURIComponent(serverName)}&offset=${offset}&limit=${limit}`
  );
}

export async function clearCache(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/media/cache', {
    method: 'DELETE',
  });
}

export interface WatchlistStatus {
  rating_key: string;
  title: string;
  on_watchlist: boolean;
}

export interface WatchlistItem {
  guid: string;
  title: string;
  type: string;
  year: number | null;
  thumb: string | null;
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  return apiFetch<WatchlistItem[]>('/api/media/watchlist');
}

export async function getWatchlistStatus(
  serverName: string,
  ratingKey: string
): Promise<WatchlistStatus> {
  return apiFetch<WatchlistStatus>(
    `/api/media/watchlist/status?server_name=${encodeURIComponent(serverName)}&rating_key=${encodeURIComponent(ratingKey)}`
  );
}

export async function addToWatchlist(
  serverName: string,
  ratingKey: string
): Promise<WatchlistStatus> {
  return apiFetch<WatchlistStatus>(
    `/api/media/watchlist?server_name=${encodeURIComponent(serverName)}&rating_key=${encodeURIComponent(ratingKey)}`,
    { method: 'POST' }
  );
}

export async function removeFromWatchlist(
  serverName: string,
  ratingKey: string
): Promise<WatchlistStatus> {
  return apiFetch<WatchlistStatus>(
    `/api/media/watchlist?server_name=${encodeURIComponent(serverName)}&rating_key=${encodeURIComponent(ratingKey)}`,
    { method: 'DELETE' }
  );
}
