import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  useServers,
  useLibraries,
  getServerName,
} from "../../hooks/useMediaItems";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: servers } = useServers();
  const firstServer = servers?.[0] ?? null;
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const selectedServer = selectedServerId
    ? servers?.find((s) => s.client_identifier === selectedServerId) ??
      firstServer
    : firstServer;

  const serverName = selectedServer ? getServerName(selectedServer) : null;
  const clientIdentifier = selectedServer?.client_identifier ?? null;
  const { data: libraries, isLoading: librariesLoading } =
    useLibraries(serverName);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const location = useLocation();
  const pathParts = location.pathname.split("/");
  const currentLibraryKey =
    pathParts[1] === "movies" || pathParts[1] === "shows" ? pathParts[2] : null;

  const movieLibraries = libraries?.filter((lib) => lib.type === "movie") || [];
  const showLibraries = libraries?.filter((lib) => lib.type === "show") || [];

  const buildLibraryPath = (lib: { key: string; type: string }) => {
    const prefix = lib.type === "movie" ? "/movies" : "/shows";
    return `${prefix}/${lib.key}?server=${encodeURIComponent(
      serverName!
    )}&machine=${encodeURIComponent(clientIdentifier!)}`;
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.sidebarTitle}>Plexy Media Dashboard</h1>
        </div>

        <div className={styles.navSection}>
          {librariesLoading && <p className={styles.loadingText}>Loading...</p>}

          {movieLibraries.length > 0 && (
            <>
              <div className={styles.navSectionLabel}>Movies</div>
              {movieLibraries.map((lib) => (
                <NavLink
                  key={lib.key}
                  to={buildLibraryPath(lib)}
                  className={({ isActive }) =>
                    `${styles.navLink} ${
                      isActive || currentLibraryKey === lib.key
                        ? styles.navLinkActive
                        : ""
                    }`
                  }
                >
                  <span>{lib.title}</span>
                  {lib.count !== null && (
                    <span className={styles.navLinkCount}>{lib.count}</span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          {showLibraries.length > 0 && (
            <>
              <div className={styles.navSectionLabel}>TV Shows</div>
              {showLibraries.map((lib) => (
                <NavLink
                  key={lib.key}
                  to={buildLibraryPath(lib)}
                  className={({ isActive }) =>
                    `${styles.navLink} ${
                      isActive || currentLibraryKey === lib.key
                        ? styles.navLinkActive
                        : ""
                    }`
                  }
                >
                  <span>{lib.title}</span>
                  {lib.count !== null && (
                    <span className={styles.navLinkCount}>{lib.count}</span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          <div className={styles.navDivider} />

          <NavLink
            to={`/agent?server=${encodeURIComponent(
              serverName ?? ""
            )}&machine=${encodeURIComponent(clientIdentifier ?? "")}`}
            className={({ isActive }) =>
              `${styles.agentNavLink} ${
                isActive ? styles.agentNavLinkActive : ""
              }`
            }
          >
            <img src="/plexy.png" alt="Plexy" className={styles.agentIcon} />
            <span>Plexy Assistant</span>
          </NavLink>
        </div>

        <div className={styles.sidebarFooter}>
          {servers && servers.length > 1 && (
            <div className={styles.serverSelector}>
              <select
                value={selectedServer?.client_identifier || ""}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className={styles.serverSelect}
              >
                {servers.map((server) => (
                  <option
                    key={server.client_identifier}
                    value={server.client_identifier}
                  >
                    {server.name} {server.local ? "(Local)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.footerRow}>
            {user && <span className={styles.username}>{user.username}</span>}
            <button onClick={logout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
