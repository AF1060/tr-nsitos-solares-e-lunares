import { recordPlanes } from '../lib/sightings';
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getAircraft } from 'zitejs/api';
import { useApp } from './AppContext';
import { predict, Plane, PlanePrediction } from '../lib/aircraft';

interface Ctx {
  watching: boolean;
  setWatching: (b: boolean) => void;
  planes: Plane[];
  predictions: PlanePrediction[];
  lastUpdate: number | null;
  error: string | null;
  source: string;
  paused: boolean;
}

const AircraftCtx = createContext<Ctx | null>(null);
export const useAircraft = () => useContext(AircraftCtx)!;
export const RADAR_KM = 80;
export const POLL_MS = 45_000;
/** Dados mais antigos do que isto deixam de servir para prever passagens. */
export const STALE_MS = 180_000;

export function AircraftProvider({ children }: { children: ReactNode }) {
  const { home, target, settings, loaded } = useApp();
  const [watching, setWatching] = useState(false);
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [lastUpdate, setLast] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ source: '' });
  const [now, setNow] = useState(Date.now());
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!watching || !loaded) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let busy = false;
    let lastFetch = 0;
    const visible = () => document.visibilityState === 'visible';
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (alive && visible()) timer = setTimeout(poll, delay);
    };
    async function poll() {
      if (!alive || !visible() || busy) return;
      busy = true; lastFetch = Date.now();
      try {
        const r = await getAircraft({ lat: home.lat, lon: home.lon, radiusKm: RADAR_KM });
        if (!alive) return;
        setMeta({ source: r.source });
        setPlanes(r.planes); setLast(Date.now()); recordPlanes(r.planes);
        setError(null); failures = 0;
      } catch {
        failures++;
        if (alive) setError('Sem ligação às fontes de dados de aviões (adsb.lol), possivelmente por limite diário de pedidos. A tentar de novo com intervalos crescentes…');
      } finally {
        busy = false;
        // Recuo progressivo em caso de erro (45 s, 90 s, 3 min, máx. 5 min) para não gastar o limite diário.
        schedule(Math.min(POLL_MS * 2 ** failures, 300_000));
      }
    }
    // Pausa quando o separador não está visível; ao voltar, atualiza logo se os dados já forem antigos.
    const onVisibility = () => {
      if (!alive) return;
      if (visible()) {
        setPaused(false);
        schedule(Math.max(0, Math.min(POLL_MS * 2 ** failures, 300_000) - (Date.now() - lastFetch)));
      } else {
        setPaused(true);
        clearTimeout(timer);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    setPaused(!visible());
    if (visible()) void poll();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [watching, loaded, home]);

  useEffect(() => {
    if (!watching || paused) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, [watching, paused]);

  const predictions = useMemo(() => {
    if (!watching || paused || (lastUpdate !== null && now - lastUpdate > STALE_MS)) return [];
    return planes
      .map((p) => predict(p, home, target, settings.marginDegrees, now, settings.maxTravelKm, settings.aircraftOffsetPercent / 100))
      .filter((x): x is PlanePrediction => !!x && (x.closest > now - 3000 || x.alternatives.length > 0))
      .sort((a, b) => (a.alternatives[0]?.t ?? a.closest) - (b.alternatives[0]?.t ?? b.closest));
  }, [planes, home, target, settings.marginDegrees, settings.maxTravelKm, settings.aircraftOffsetPercent, now, watching, paused, lastUpdate]);

  return (
    <AircraftCtx.Provider value={{ watching, setWatching, planes, predictions, lastUpdate, error, paused, ...meta }}>
      {children}
    </AircraftCtx.Provider>
  );
}
