import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { PinResponse, UserInfo } from '../api/auth';
import { createPin, checkPin, exchangeToken, getCurrentUser } from '../api/auth';
import { clearAuthToken, isAuthenticated } from '../api/client';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: isAuthenticated(),
    isLoading: false,
    user: null,
    error: null,
  });
  const pollingRef = useRef<number | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Query for current user when authenticated
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
    enabled: authState.isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (user) {
      setAuthState((prev) => ({ ...prev, user }));
    }
  }, [user]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const login = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Create a new PIN
      const pin: PinResponse = await createPin();

      // Open the Plex auth URL in a popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupRef.current = window.open(
        pin.auth_url,
        'plex-auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for PIN completion
      pollingRef.current = window.setInterval(async () => {
        try {
          const pinStatus = await checkPin(pin.id, pin.code);

          if (pinStatus.auth_token) {
            stopPolling();
            popupRef.current?.close();

            // Exchange PIN for JWT
            await exchangeToken(pin.id, pin.code);

            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              user: null,
              error: null,
            });

            // Invalidate and refetch user data
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });

            navigate('/dashboard');
          }
        } catch {
          // Ignore polling errors, continue polling
        }
      }, 1000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollingRef.current) {
          stopPolling();
          popupRef.current?.close();
          setAuthState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Authentication timed out. Please try again.',
          }));
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to start authentication',
      }));
    }
  }, [navigate, queryClient, stopPolling]);

  const logout = useCallback(() => {
    clearAuthToken();
    queryClient.clear();
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
    navigate('/');
  }, [navigate, queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    ...authState,
    login,
    logout,
  };
}
