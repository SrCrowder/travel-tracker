import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import './i18n'; // initialise i18next before first render

// Create the React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Apply persisted dark mode preference before first render
const stored = localStorage.getItem('travel-tracker-prefs');
if (stored) {
  try {
    const prefs = JSON.parse(stored);
    if (prefs?.state?.darkMode) {
      document.documentElement.classList.add('dark');
    }
  } catch {
    // ignore parse errors
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
