import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Server, Library } from '../api/media';
import { getServers, getLibraries, getLibraryItems } from '../api/media';

export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: getServers,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useLibraries(serverName: string | null) {
  return useQuery({
    queryKey: ['libraries', serverName],
    queryFn: () => getLibraries(serverName!),
    enabled: !!serverName,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useLibraryItems(
  serverName: string | null,
  libraryKey: string | null,
  limit: number = 50
) {
  return useInfiniteQuery({
    queryKey: ['libraryItems', serverName, libraryKey, limit],
    queryFn: ({ pageParam = 0 }) =>
      getLibraryItems(serverName!, libraryKey!, pageParam, limit),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: !!serverName && !!libraryKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function getServerName(server: Server): string {
  return server.name;
}

export function filterLibrariesByType(libraries: Library[], type: 'movie' | 'show'): Library[] {
  return libraries.filter((lib) => lib.type === type);
}
