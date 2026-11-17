import { NavLink, Outlet } from 'react-router-dom';
import { Sun, Moon, Radar, Satellite, Settings2, Telescope, Sparkles } from 'lucide-react';
import { Toaster } from '@project/components/ui/sonner';
import { cn } from '@project/components/lib/utils';
import { useApp } from '../context/AppContext';
import { useAircraft } from '../context/AircraftContext';
import AlarmOverlay from './AlarmOverlay';

const NAV = [
  { to: '/', label: 'Agora', icon: Telescope },
  { to: '/avioes', label: 'Aviões', icon: Radar },
  { to: '/iss', label: 'ISS', icon: Satellite },
  { to: '/via-lactea', label: 'Via Láctea', icon: Sparkles },
  { to: '/definicoes', label: 'Definições', icon: Settings2 },
];

export default function Layout() {
  const { target, setTarget } = useApp();
  const { watching } = useAircraft();
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sun className="h-4 w-4" /></div>
            <span className="text-lg font-semibold tracking-tight">Trânsitos</span>
          </div>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <n.icon className="h-4 w-4" />{n.label}
                {n.to === '/avioes' && watching && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              </NavLink>
            ))}
          </nav>
          <div className="flex rounded-full border border-border p-0.5 text-sm">
            {(['Sol', 'Lua'] as const).map((t) => (
              <button key={t} onClick={() => setTarget(t)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors', target === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                {t === 'Sol' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}{t}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-primary' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" />{n.label}
          </NavLink>
        ))}
      </nav>
      <AlarmOverlay />
      <Toaster />
    </div>
  );
}
