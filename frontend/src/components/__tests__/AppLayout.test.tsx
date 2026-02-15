import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { AppLayout } from '../layout/AppLayout';

function renderWithRouter(initialRoute = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/movies/:libraryKey" element={<div>Movies Content</div>} />
          <Route path="/shows/:libraryKey" element={<div>Shows Content</div>} />
          <Route path="/agent" element={<div>Agent Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogout.mockReset();
  mockAuthState = {
    isAuthenticated: true,
    user: { username: 'testuser' },
    logout: mockLogout,
  };
  mockServers = [
    { name: 'MyServer', client_identifier: 'abc123', local: true },
  ];
  mockLibraries = [
    { key: '1', title: 'All Movies', type: 'movie', count: 42 },
    { key: '2', title: '4K Movies', type: 'movie', count: 18 },
    { key: '3', title: 'Anime', type: 'show', count: 35 },
  ];
  mockLibrariesLoading = false;
});

describe('AppLayout', () => {
  it('renders sidebar with logo and title', () => {
    renderWithRouter();
    expect(screen.getByText('Plexy Media Dashboard')).toBeInTheDocument();
    const logos = screen.getAllByAltText('Plexy');
    expect(logos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders child route content via Outlet', () => {
    renderWithRouter('/dashboard');
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders library nav links grouped by type with section labels', () => {
    renderWithRouter();

    // Section labels
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('TV Shows')).toBeInTheDocument();

    // Library titles as nav links
    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.getByText('4K Movies')).toBeInTheDocument();
    expect(screen.getByText('Anime')).toBeInTheDocument();
  });

  it('renders library counts next to nav links', () => {
    renderWithRouter();

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('does not render counts when count is null', () => {
    mockLibraries = [
      { key: '1', title: 'All Movies', type: 'movie', count: null },
    ];
    renderWithRouter();

    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders Plexy agent nav link', () => {
    renderWithRouter();
    expect(screen.getByText('Plexy')).toBeInTheDocument();
  });

  it('renders username in sidebar footer', () => {
    renderWithRouter();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('calls logout when Logout button is clicked', () => {
    renderWithRouter();
    fireEvent.click(screen.getByText('Logout'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('redirects to / when not authenticated', () => {
    mockAuthState = {
      isAuthenticated: false,
      user: null,
      logout: mockLogout,
    };
    renderWithRouter();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows loading text when libraries are loading', () => {
    mockLibrariesLoading = true;
    mockLibraries = undefined;
    renderWithRouter();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not show server selector with single server', () => {
    renderWithRouter();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows server selector with multiple servers', () => {
    mockServers = [
      { name: 'Server A', client_identifier: 'aaa', local: true },
      { name: 'Server B', client_identifier: 'bbb', local: false },
    ];
    renderWithRouter();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Server A (Local)')).toBeInTheDocument();
    expect(screen.getByText(/Server B/)).toBeInTheDocument();
  });

  it('changes selected server when selector changes', () => {
    mockServers = [
      { name: 'Server A', client_identifier: 'aaa', local: true },
      { name: 'Server B', client_identifier: 'bbb', local: false },
    ];
    renderWithRouter();
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'bbb' } });
    expect((select as HTMLSelectElement).value).toBe('bbb');
  });

  it('builds correct movie library link paths', () => {
    renderWithRouter();
    const link = screen.getByText('4K Movies').closest('a');
    expect(link?.getAttribute('href')).toContain('/movies/2');
    expect(link?.getAttribute('href')).toContain('server=MyServer');
    expect(link?.getAttribute('href')).toContain('machine=abc123');
  });

  it('builds correct show library link paths', () => {
    renderWithRouter();
    const link = screen.getByText('Anime').closest('a');
    expect(link?.getAttribute('href')).toContain('/shows/3');
    expect(link?.getAttribute('href')).toContain('server=MyServer');
  });

  it('does not render library sections when no libraries', () => {
    mockLibraries = [];
    renderWithRouter();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(screen.queryByText('35')).not.toBeInTheDocument();
  });

  it('does not show username when user is null', () => {
    mockAuthState = {
      isAuthenticated: true,
      user: null,
      logout: mockLogout,
    };
    renderWithRouter();
    expect(screen.queryByText('testuser')).not.toBeInTheDocument();
  });
});
