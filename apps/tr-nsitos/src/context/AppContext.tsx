import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { toast } from 'sonner';
import { getSettings, saveSettings, getIssTle, listPlannedPasses, ListPlannedPassesOutputType } from 'zitejs/api';
import type { Target } from '../lib/astro';
import { makeSat, searchTransits, IssTransit, SatRec } from '../lib/iss';
import { fetchWeather, Weather } from '../lib/weather';

export interface Settings {
  useGps: boolean;
  latitude: number;
  longitude: number;
  defaultTarget: Target;
  marginDegrees: number;
  maxTravelKm: number;
  minElevationDegrees: number;
  focalLengthMm: number;
  sensor: string;
  issAlertMinutes: number;
  aircraftAlertSeconds: number;
  voiceAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  useGps: true, latitude: 38.7223, longitude: -9.1393, defaultTarget: 'Sol', marginDegrees: 2,
  maxTravelKm: 30, minElevationDegrees: 10, focalLengthMm: 600, sensor: 'Micro 4/3',
  issAlertMinutes: 15, aircraftAlertSeconds: 60, voiceAlerts: true,
};

export type PlannedPass = ListPlannedPassesOutputType['passes'][0];

interface IssState {
  status: 'loading' | 'computing' | 'ready' | 'error';
  progress: number;
  passes: IssTransit[];
  tleAt: number | null;
  error?: string;
}

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update: (p: Partial<Settings>) => void;
  target: Target;
  setTarget: (t: Target) => void;
  home: { lat: number; lon: number };
  gpsStatus: 'off' | 'pending' | 'ok' | 'error';
  locate: () => void;
  weather: Weather | null;
  sat: SatRec | null;
  iss: IssState;
  planned: PlannedPass[];
  refreshPlanned: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<Target>('Sol');
  const [gpsStatus, setGps] = useState<Ctx['gpsStatus']>('off');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [sat, setSat] = useState<SatRec | null>(null);
  const [tleAt, setTleAt] = useState<number | null>(null);
  const [iss, setIss] = useState<IssState>({ status: 'loading', progress: 0, passes: [], tleAt: null });
  const [planned, setPlanned] = useState<PlannedPass[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const persist = useDebouncedCallback((s: Settings) => {
    saveSettings(s).catch(() => toast.error('Não foi possível guardar as definições'));
  }, 700);

  const update = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...p };
      persist(n);
      return n;
    });
  }, [persist]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setGps('error'); return; }
    setGps('pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps('ok');
        const s = settingsRef.current;
        const lat = +pos.coords.latitude.toFixed(5), lon = +pos.coords.longitude.toFixed(5);
        if (Math.abs(lat - s.latitude) > 0.001 || Math.abs(lon - s.longitude) > 0.001) update({ latitude: lat, longitude: lon });
      },
      () => { setGps('error'); toast.error('Não foi possível obter a localização GPS'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [update]);

  useEffect(() => {
    getSettings({})
      .then(({ settings: s }) => {
        if (s) {
          const merged: Settings = {
            ...DEFAULT_SETTINGS, ...s,
            latitude: s.latitude ?? DEFAULT_SETTINGS.latitude,
            longitude: s.longitude ?? DEFAULT_SETTINGS.longitude,
            defaultTarget: s.defaultTarget === 'Lua' ? 'Lua' : 'Sol',
          };
          setSettings(merged);
          setTarget(merged.defaultTarget);
        }
      })
      .catch(() => toast.error('Não foi possível ler as definições'))
      .finally(() => setLoaded(true));
    getIssTle({})
      .then((t) => {
        localStorage.setItem('issTle', JSON.stringify(t));
        setSat(makeSat(t.line1, t.line2)); setTleAt(t.fetchedAt);
      })
      .catch(() => {
        // Usa os últimos dados guardados no telemóvel (válidos alguns dias)
        const saved = localStorage.getItem('issTle');
        const t = saved ? (JSON.parse(saved) as { line1: string; line2: string; fetchedAt: number }) : null;
        if (t && Date.now() - t.fetchedAt < 5 * 86400_000) {
          setSat(makeSat(t.line1, t.line2)); setTleAt(t.fetchedAt);
          toast.warning('Fontes orbitais indisponíveis: a usar os últimos dados guardados');
        } else {
          setIss((s) => ({ ...s, status: 'error', error: 'Os servidores de dados orbitais da ISS não responderam. Tente mais tarde.' }));
        }
      });
  }, []);

  useEffect(() => {
    if (loaded && settings.useGps) locate();
  }, [loaded, settings.useGps, locate]);

  const home = useMemo(() => ({ lat: settings.latitude, lon: settings.longitude }), [settings.latitude, settings.longitude]);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const load = () => fetchWeather(home.lat, home.lon).then((w) => alive && setWeather(w)).catch(() => {});
    load();
    const id = setInterval(load, 30 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [loaded, home]);

  useEffect(() => {
    if (!loaded || !sat) return;
    let alive = true;
    setIss((s) => ({ ...s, status: 'computing', progress: 0 }));
    const opts = { home, maxTravelKm: settings.maxTravelKm, minElevDeg: settings.minElevationDegrees, days: 10 };
    (async () => {
      const sol = await searchTransits(sat, 'Sol', { ...opts, onProgress: (p) => alive && setIss((s) => ({ ...s, progress: p / 2 })) });
      if (!alive) return;
      const lua = await searchTransits(sat, 'Lua', { ...opts, onProgress: (p) => alive && setIss((s) => ({ ...s, progress: 0.5 + p / 2 })) });
      if (!alive) return;
      setIss({ status: 'ready', progress: 1, passes: [...sol, ...lua].sort((a, b) => a.center - b.center), tleAt });
    })().catch(() => alive && setIss((s) => ({ ...s, status: 'error', error: 'Falha no cálculo das passagens' })));
    return () => { alive = false; };
  }, [loaded, sat, tleAt, home, settings.maxTravelKm, settings.minElevationDegrees]);

  const refreshPlanned = useCallback(async () => {
    try {
      const r = await listPlannedPasses({});
      setPlanned(r.passes);
    } catch {
      toast.error('Não foi possível ler os alarmes');
    }
  }, []);
  useEffect(() => { void refreshPlanned(); }, [refreshPlanned]);

  return (
    <AppCtx.Provider value={{ settings, loaded, update, target, setTarget, home, gpsStatus, locate, weather, sat, iss, planned, refreshPlanned }}>
      {children}
    </AppCtx.Provider>
  );
}
