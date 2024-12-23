import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { LastFmProvider } from '@/contexts/last-fm-context';
import SpotifyCallback from '@/pages/Callbacks/SpotifyCallback';
import AlbumDetails from '@/pages/Details/AlbumDetails';
import PlaylistDetails from '@/pages/Details/PlaylistDetails';
import Home from '@/pages/Home/Home';
import Landing from '@/pages/Landing/Landing';
import Library from '@/pages/Library/index';
import Settings from '@/pages/Settings/Settings';
import LastFmDashboard from '@/pages/Stats/LastFmDashboard';
import TransferHistory from '@/pages/TransferHistory';
import Layout from '@/shared/layouts/Layout';
import { ProtectedRoute } from '@/shared/layouts/ProtectedRoute';
import { ThemeProvider } from '@/shared/layouts/theme-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <LastFmProvider>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/spotify/callback" element={<SpotifyCallback />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/home" element={<Home />} />
                    <Route path="/library" element={<Library />} />
                    <Route path="/album/:id" element={<AlbumDetails />} />
                    <Route path="/playlist/:id" element={<PlaylistDetails />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route
                      path="/transfer-history"
                      element={<TransferHistory />}
                    />
                    <Route path="/lastfm" element={<LastFmDashboard />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </LastFmProvider>
          </AuthProvider>
        </Router>
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
