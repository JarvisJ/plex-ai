import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWatchlist,
  addToWatchlist as addToWatchlistApi,
  removeFromWatchlist as removeFromWatchlistApi,
} from '../api/media';
import type { WatchlistItem } from '../api/media';

interface WatchlistContextValue {
  watchlist: WatchlistItem[];
  isLoading: boolean;
  isOnWatchlist: (guid: string) => boolean;
  addToWatchlist: (serverName: string, ratingKey: string) => Promise<void>;
  removeFromWatchlist: (serverName: string, ratingKey: string) => Promise<void>;
  toggleWatchlist: (serverName: string, ratingKey: string, guid: string) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const watchlistSet = useMemo(
    () => new Set(query.data?.map((item) => item.guid) ?? []),
    [query.data]
  );

  const addMutation = useMutation({
    mutationFn: ({ serverName, ratingKey }: { serverName: string; ratingKey: string }) =>
      addToWatchlistApi(serverName, ratingKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ serverName, ratingKey }: { serverName: string; ratingKey: string }) =>
      removeFromWatchlistApi(serverName, ratingKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const value: WatchlistContextValue = useMemo(
    () => ({
      watchlist: query.data ?? [],
      isLoading: query.isLoading,
      isOnWatchlist: (guid: string) => watchlistSet.has(guid),
      addToWatchlist: async (serverName: string, ratingKey: string) => {
        await addMutation.mutateAsync({ serverName, ratingKey });
      },
      removeFromWatchlist: async (serverName: string, ratingKey: string) => {
        await removeMutation.mutateAsync({ serverName, ratingKey });
      },
      toggleWatchlist: async (serverName: string, ratingKey: string, guid: string) => {
        if (watchlistSet.has(guid)) {
          await removeMutation.mutateAsync({ serverName, ratingKey });
        } else {
          await addMutation.mutateAsync({ serverName, ratingKey });
        }
      },
    }),
    [query.data, query.isLoading, watchlistSet, addMutation, removeMutation]
  );

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
