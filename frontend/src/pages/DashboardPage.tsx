import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useServers, useLibraries, getServerName } from '../hooks/useMediaItems';
import { clearCache } from '../api/media';
import type { Library } from '../api/media';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: servers, isLoading: serversLoading, error: serversError } = useServers();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await clearCache();
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const firstServer = servers?.[0] ?? null;
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const selectedServer = selectedServerId
    ? servers?.find((s) => s.client_identifier === selectedServerId) ?? firstServer
    : firstServer;

  const serverName = selectedServer ? getServerName(selectedServer) : null;
  const { data: libraries, isLoading: librariesLoading } = useLibraries(serverName);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const movieLibraries = libraries?.filter((lib) => lib.type === 'movie') || [];
  const showLibraries = libraries?.filter((lib) => lib.type === 'show') || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Plex Media Dashboard</h1>
        <div className={styles.headerActions}>
          {user && <span className={styles.username}>{user.username}</span>}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={styles.headerButton}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={logout} className={styles.headerButton}>
            Logout
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {serversLoading && <p className={styles.loadingText}>Loading servers...</p>}
        {serversError && (
          <p className={styles.errorText}>Failed to load servers. Please try again.</p>
        )}

        {servers && servers.length > 1 && (
          <div className={styles.serverSelector}>
            <label className={styles.serverLabel}>Select Server</label>
            <select
              value={selectedServer?.client_identifier || ''}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className={styles.serverSelect}
            >
              {servers.map((server) => (
                <option key={server.client_identifier} value={server.client_identifier}>
                  {server.name} {server.local ? '(Local)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {librariesLoading && <p className={styles.loadingText}>Loading libraries...</p>}

        {!librariesLoading && (
          <div className={styles.librariesGrid}>
            {movieLibraries.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Movies</h2>
                <div className={styles.libraryGrid}>
                  {movieLibraries.map((library) => (
                    <LibraryCard
                      key={library.key}
                      library={library}
                      serverName={serverName!}
                    />
                  ))}
                </div>
              </section>
            )}

            {showLibraries.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>TV Shows</h2>
                <div className={styles.libraryGrid}>
                  {showLibraries.map((library) => (
                    <LibraryCard
                      key={library.key}
                      library={library}
                      serverName={serverName!}
                    />
                  ))}
                </div>
              </section>
            )}

            {movieLibraries.length === 0 && showLibraries.length === 0 && (
              <p className={styles.emptyText}>No libraries found on this server.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

interface LibraryCardProps {
  library: Library;
  serverName: string;
}

function LibraryCard({ library, serverName }: LibraryCardProps) {
  const linkPath =
    library.type === 'movie'
      ? `/movies/${library.key}?server=${encodeURIComponent(serverName)}`
      : `/shows/${library.key}?server=${encodeURIComponent(serverName)}`;

  return (
    <Link to={linkPath} className={styles.libraryCard}>
      <h3 className={styles.libraryTitle}>{library.title}</h3>
      {library.count !== null && (
        <p className={styles.libraryCount}>
          {library.count} {library.type === 'movie' ? 'movies' : 'shows'}
        </p>
      )}
    </Link>
  );
}
