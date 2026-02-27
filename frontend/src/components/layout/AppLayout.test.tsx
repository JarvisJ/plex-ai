import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

let mockAuthState = {
  isAuthenticated: true,
  user: { username: 'testuser' } as { username: string } | null,
  logout: mockLogout,
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

let mockServers: { name: string; client_identifier: string; local: boolean }[] | undefined = undefined;
let mockLibraries: { key: string; title: string; type: string; count: number | null }[] | undefined = undefined;
let mockLibrariesLoading = false;

vi.mock('../../hooks/useMediaItems', () => ({
  useServers: () => ({ data: mockServers }),
  useLibraries: () => ({ data: mockLibraries, isLoading: mockLibrariesLoading }),
  getServerName: (server: { name: string }) => server.name,
}));

let mockConversations: Array<{ conversation_id: string; title: string; created_at: number; updated_at: number }> = [];

vi.mock('../../api/agent', () => ({
  listConversations: () => Promise.resolve(mockConversations),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { AppLayout } from './AppLayout';

function renderWithRouter(initialRoute = '/dashboard') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Content</div>} />
            <Route path="/movies/:libraryKey" element={<div>Movies Content</div>} />
            <Route path="/shows/:libraryKey" element={<div>Shows Content</div>} />
            <Route path="/agent" element={<div>Agent Content</div>} />
            <Route path="/agent/:conversationId" element={<div>Agent Conversation Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const defaultAuthState = {
  isAuthenticated: true,
  user: { username: 'testuser' } as { username: string } | null,
  logout: mockLogout,
};

const defaultServers = [{ name: 'MyServer', client_identifier: 'abc123', local: true }];

const defaultLibraries = [
  { key: '1', title: 'All Movies', type: 'movie', count: 42 },
  { key: '2', title: '4K Movies', type: 'movie', count: 18 },
  { key: '3', title: 'Anime', type: 'show', count: 35 },
];

interface SetupOptions {
  authState?: { isAuthenticated?: boolean; user?: { username: string } | null };
  servers?: { name: string; client_identifier: string; local: boolean }[] | undefined;
  libraries?: { key: string; title: string; type: string; count: number | null }[] | undefined;
  librariesLoading?: boolean;
  conversations?: Array<{ conversation_id: string; title: string; created_at: number; updated_at: number }>;
  initialRoute?: string;
}

function setup({
  authState,
  servers = defaultServers,
  libraries = defaultLibraries,
  librariesLoading = false,
  conversations = [],
  initialRoute = '/dashboard',
}: SetupOptions = {}) {
  mockNavigate.mockReset();
  mockLogout.mockReset();
  mockAuthState = { ...defaultAuthState, ...authState };
  mockServers = servers;
  mockLibraries = libraries;
  mockLibrariesLoading = librariesLoading;
  mockConversations = conversations;
  renderWithRouter(initialRoute);
  return { mockLogout, mockNavigate };
}

describe('AppLayout', () => {
  it('renders sidebar with logo and title', () => {
    setup();
    const titles = screen.getAllByText('Plexy Media Dashboard');
    expect(titles.length).toBe(2); // mobile header + sidebar
    const logos = screen.getAllByAltText('Plexy');
    expect(logos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders child route content via Outlet', () => {
    setup({ initialRoute: '/dashboard' });
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders library nav links grouped by type with section labels', () => {
    setup();

    // Section labels
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('TV Shows')).toBeInTheDocument();

    // Library titles as nav links
    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.getByText('4K Movies')).toBeInTheDocument();
    expect(screen.getByText('Anime')).toBeInTheDocument();
  });

  it('renders library counts next to nav links', () => {
    setup();

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('does not render counts when count is null', () => {
    setup({ libraries: [{ key: '1', title: 'All Movies', type: 'movie', count: null }] });

    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders Plexy agent nav link', () => {
    setup();
    expect(screen.getByText('Plexy Assistant')).toBeInTheDocument();
  });

  it('renders username in sidebar footer', () => {
    setup();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('calls logout when Logout button is clicked', () => {
    const { mockLogout } = setup();
    fireEvent.click(screen.getByText('Logout'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('redirects to / when not authenticated', () => {
    const { mockNavigate } = setup({ authState: { isAuthenticated: false, user: null } });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows loading text when libraries are loading', () => {
    setup({ librariesLoading: true, libraries: undefined });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not show server selector with single server', () => {
    setup();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows server selector with multiple servers', () => {
    setup({
      servers: [
        { name: 'Server A', client_identifier: 'aaa', local: true },
        { name: 'Server B', client_identifier: 'bbb', local: false },
      ],
    });
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Server A (Local)')).toBeInTheDocument();
    expect(screen.getByText(/Server B/)).toBeInTheDocument();
  });

  it('changes selected server when selector changes', () => {
    setup({
      servers: [
        { name: 'Server A', client_identifier: 'aaa', local: true },
        { name: 'Server B', client_identifier: 'bbb', local: false },
      ],
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'bbb' } });
    expect((select as HTMLSelectElement).value).toBe('bbb');
  });

  it('builds correct movie library link paths', () => {
    setup();
    const link = screen.getByText('4K Movies').closest('a');
    expect(link?.getAttribute('href')).toContain('/movies/2');
    expect(link?.getAttribute('href')).toContain('server=MyServer');
    expect(link?.getAttribute('href')).toContain('machine=abc123');
  });

  it('builds correct show library link paths', () => {
    setup();
    const link = screen.getByText('Anime').closest('a');
    expect(link?.getAttribute('href')).toContain('/shows/3');
    expect(link?.getAttribute('href')).toContain('server=MyServer');
  });

  it('does not render library sections when no libraries', () => {
    setup({ libraries: [] });
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(screen.queryByText('35')).not.toBeInTheDocument();
  });

  it('does not show username when user is null', () => {
    setup({ authState: { isAuthenticated: true, user: null } });
    expect(screen.queryByText('testuser')).not.toBeInTheDocument();
  });

  it('renders conversation list when conversations exist', async () => {
    setup({
      conversations: [
        { conversation_id: 'conv-1', title: 'What movies do I have?', created_at: 1000, updated_at: 2000 },
        { conversation_id: 'conv-2', title: 'Recommend something', created_at: 1500, updated_at: 2500 },
      ],
    });

    // Conversations load async via useQuery
    expect(await screen.findByText('What movies do I have?')).toBeInTheDocument();
    expect(screen.getByText('Recommend something')).toBeInTheDocument();
  });

  it('renders hamburger menu button', () => {
    setup();
    expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
  });

  it('toggles sidebarOpen class when hamburger is clicked', () => {
    setup();
    const hamburger = screen.getByLabelText('Toggle menu');
    const nav = document.querySelector('nav')!;

    expect(nav.className).not.toContain('sidebarOpen');

    fireEvent.click(hamburger);
    expect(nav.className).toContain('sidebarOpen');

    fireEvent.click(hamburger);
    expect(nav.className).not.toContain('sidebarOpen');
  });

  it('closes menu when overlay is clicked', () => {
    setup();
    const hamburger = screen.getByLabelText('Toggle menu');
    const overlay = screen.getByTestId('menu-overlay');

    fireEvent.click(hamburger);
    const nav = document.querySelector('nav')!;
    expect(nav.className).toContain('sidebarOpen');

    fireEvent.click(overlay);
    expect(nav.className).not.toContain('sidebarOpen');
  });

  it('conversation links include correct href', async () => {
    setup({
      conversations: [
        { conversation_id: 'conv-1', title: 'Test chat', created_at: 1000, updated_at: 2000 },
      ],
    });

    const link = await screen.findByText('Test chat');
    const anchor = link.closest('a');
    expect(anchor?.getAttribute('href')).toContain('/agent/conv-1');
    expect(anchor?.getAttribute('href')).toContain('server=MyServer');
  });
});
