import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from 'zitejs/auth';
import { AppProvider } from './context/AppContext';
import { AircraftProvider } from './context/AircraftContext';
import Layout from './components/Layout';
import Now from './pages/Now';
import Aircraft from './pages/Aircraft';
import Iss from './pages/Iss';
import SettingsPage from './pages/Settings';

document.documentElement.classList.add('dark');

export default function App() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  return (
    <AppProvider>
      <AircraftProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Now />} />
              <Route path="/avioes" element={<Aircraft />} />
              <Route path="/iss" element={<Iss />} />
              <Route path="/definicoes" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AircraftProvider>
    </AppProvider>
  );
}
