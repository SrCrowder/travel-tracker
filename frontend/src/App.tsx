import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import TripDetail from './pages/TripDetail';
import { useStore } from './store/useStore';

export default function App() {
  const { darkMode } = useStore();

  // Keep the <html> class in sync whenever darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-warm-50 dark:bg-slate-900 transition-colors duration-300">
        {/* Each page renders its own Navbar with the correct props */}
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/trip/:id" element={<TripDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
