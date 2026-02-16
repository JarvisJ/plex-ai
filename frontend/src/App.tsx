import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WatchlistProvider } from './contexts/WatchlistContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MoviesPage, ShowsPage } from './pages/LibraryPage';
import { AgentPage } from './pages/AgentPage';
import { AppLayout } from './components/layout/AppLayout';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WatchlistProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/movies/:libraryKey" element={<MoviesPage />} />
              <Route path="/shows/:libraryKey" element={<ShowsPage />} />
              <Route path="/agent" element={<AgentPage />} />
              <Route path="/agent/:conversationId" element={<AgentPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WatchlistProvider>
    </QueryClientProvider>
  );
}

export default App;
