import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import {
  useServers,
  useLibraries,
  getServerName,
} from "../hooks/useMediaItems";
import { clearCache } from "../api/media";
import type { Library } from "../api/media";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: servers } = useServers();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await clearCache();
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error("Failed to refresh cache:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const firstServer = servers?.[0] ?? null;
  const serverName = firstServer ? getServerName(firstServer) : null;
  const clientIdentifier = firstServer?.client_identifier ?? null;
  const { data: libraries, isLoading: librariesLoading } =
    useLibraries(serverName);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const movieLibraries = libraries?.filter((lib) => lib.type === "movie") || [];
  const showLibraries = libraries?.filter((lib) => lib.type === "show") || [];

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.mainHeader}>
          <h2 className={styles.welcomeTitle}>Libraries</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={styles.headerButton}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Cache"}
          </button>
        </div>

        {librariesLoading && (
          <p className={styles.loadingText}>Loading libraries...</p>
        )}

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
                      clientIdentifier={clientIdentifier!}
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
                      clientIdentifier={clientIdentifier!}
                    />
                  ))}
                </div>
              </section>
            )}

            {movieLibraries.length === 0 && showLibraries.length === 0 && (
              <p className={styles.emptyText}>
                No libraries found on this server.
              </p>
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
  clientIdentifier: string;
}

function LibraryCard({
  library,
  serverName,
  clientIdentifier,
}: LibraryCardProps) {
  const linkPath =
    library.type === "movie"
      ? `/movies/${library.key}?server=${encodeURIComponent(
          serverName
        )}&machine=${encodeURIComponent(clientIdentifier)}`
      : `/shows/${library.key}?server=${encodeURIComponent(
          serverName
        )}&machine=${encodeURIComponent(clientIdentifier)}`;

  return (
    <Link to={linkPath} className={styles.libraryCard}>
      <h3 className={styles.libraryTitle}>{library.title}</h3>
      {library.count !== null && (
        <p className={styles.libraryCount}>
          {library.count} {library.type === "movie" ? "movies" : "shows"}
        </p>
      )}
    </Link>
  );
}
