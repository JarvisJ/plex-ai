import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import {
  useServers,
  useLibraries,
  getServerName,
} from "../../hooks/useMediaItems";
import { listConversations } from "../../api/agent";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const movieLibraries = libraries?.filter((lib) => lib.type === "movie") || [];
  const showLibraries = libraries?.filter((lib) => lib.type === "show") || [];

  const buildLibraryPath = (lib: { key: string; type: string }) => {
    const prefix = lib.type === "movie" ? "/movies" : "/shows";
    return `${prefix}/${lib.key}?server=${encodeURIComponent(
      serverName!
    )}&machine=${encodeURIComponent(clientIdentifier!)}`;
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={styles.layout}>
      <div className={styles.mobileHeader}>
        <button
          className={styles.hamburgerButton}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className={styles.mobileHeaderTitle}>Plexy Media Dashboard</h1>
        <div style={{ width: 24 }} />
      </div>

      <div
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`}
        onClick={closeMenu}
        data-testid="menu-overlay"
      />

      <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
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
                  onClick={closeMenu}
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
                  onClick={closeMenu}
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
            end
            onClick={closeMenu}
            className={({ isActive }) =>
              `${styles.agentNavLink} ${
                isActive ? styles.agentNavLinkActive : ""
              }`
            }
          >
            <img src="/plexy.png" alt="Plexy" className={styles.agentIcon} />
            <span>Plexy Assistant</span>
          </NavLink>
          <ConversationList
            serverName={serverName}
            clientIdentifier={clientIdentifier}
            onNavigate={closeMenu}
          />
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

function ConversationList({
  serverName,
  clientIdentifier,
  onNavigate,
}: {
  serverName: string | null;
  clientIdentifier: string | null;
  onNavigate?: () => void;
}) {
  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    staleTime: 30 * 1000,
  });

  if (!conversations || conversations.length === 0) return null;

  return (
    <div className={styles.conversationList}>
      {conversations.map((conv) => (
        <NavLink
          key={conv.conversation_id}
          to={`/agent/${conv.conversation_id}?server=${encodeURIComponent(
            serverName ?? ""
          )}&machine=${encodeURIComponent(clientIdentifier ?? "")}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            `${styles.conversationLink} ${
              isActive ? styles.conversationLinkActive : ""
            }`
          }
          title={conv.title}
        >
          {conv.title}
        </NavLink>
      ))}
    </div>
  );
}
