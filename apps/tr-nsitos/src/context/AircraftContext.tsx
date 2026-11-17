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
}

const AircraftCtx = createContext<Ctx | null>(null);
export const useAircraft = () => useContext(AircraftCtx)!;
export const RADAR_KM = 80;

export function AircraftProvider({ children }: { children: ReactNode }) {
  const { home, target, settings, loaded } = useApp();
  const [watching, setWatching] = useState(false);
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [lastUpdate, setLast] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ source: '' });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!watching || !loaded) return;
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await getAircraft({ lat: home.lat, lon: home.lon, radiusKm: RADAR_KM });
        if (!alive) return;
        setMeta({ source: r.source });
        setPlanes(r.planes); setLast(Date.now()); recordPlanes(r.planes);
        setError(null);
      } catch {
        if (alive) setError('Sem ligação às fontes de dados de aviões (adsb.lol). A tentar de novo…');
      }
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [watching, loaded, home]);

  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, [watching]);

  const predictions = useMemo(() => {
    if (!watching) return [];
    return planes
      .map((p) => predict(p, home, target, settings.marginDegrees, now, settings.maxTravelKm))
      .filter((x): x is PlanePrediction => !!x && (x.closest > now - 3000 || x.alternatives.length > 0))
      .sort((a, b) => (a.alternatives[0]?.t ?? a.closest) - (b.alternatives[0]?.t ?? b.closest));
  }, [planes, home, target, settings.marginDegrees, settings.maxTravelKm, now, watching]);

  return (
    <AircraftCtx.Provider value={{ watching, setWatching, planes, predictions, lastUpdate, error, ...meta }}>
      {children}
    </AircraftCtx.Provider>
  );
}
