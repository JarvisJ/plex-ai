import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../api/auth';
import { isAuthenticated } from '../api/client';

interface UseClientIdentifierReturn {
  clientIdentifier: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch the user's owned server's client identifier from the /me endpoint.
 *
 * This hook should be called at the top level of a page component and the
 * clientIdentifier value should be passed down to child components.
 *
 * @returns The client identifier of the user's owned Plex server, loading state, and error
 */
export function useClientIdentifier(): UseClientIdentifierReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    enabled: isAuthenticated(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    clientIdentifier: data?.client_identifier ?? null,
    isLoading,
    error: error as Error | null,
  };
}
