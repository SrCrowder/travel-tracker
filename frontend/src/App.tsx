import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Dashboard from './pages/Dashboard';
import TripDetail from './pages/TripDetail';
import Login from './pages/Login';
import LoadingSpinner from './components/LoadingSpinner';
import { authApi, AUTH_EXPIRED_EVENT } from './api/client';
import { useStore } from './store/useStore';

export default function App() {
  const { darkMode } = useStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Keep the <html> class in sync whenever darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: () => authApi.me().then((r) => r.data),
    staleTime: Infinity,
  });

  // Session expired mid-use → re-check, which shows the login page
  useEffect(() => {
    const onExpired = () => queryClient.invalidateQueries({ queryKey: ['auth'] });
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-warm-50 dark:bg-slate-900 transition-colors duration-300">
        {isLoading ? (
          <LoadingSpinner message={t('common.loading')} />
        ) : auth?.authRequired && !auth.authenticated ? (
          <Login />
        ) : (
          /* Each page renders its own Navbar with the correct props */
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/trip/:id" element={<TripDetail />} />
          </Routes>
        )}
      </div>
    </BrowserRouter>
  );
}
