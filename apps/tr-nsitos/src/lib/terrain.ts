import { useEffect, useState } from 'react';
import { destination, LatLon } from './geo';

const DISTS = [0.5, 1, 2, 4, 7, 12, 20, 35]; // km
const AZ_STEP = 5;
const cache = new Map<string, number[]>();

// Horizonte real a partir do relevo (Open-Meteo Elevation). Devolve a altura angular (°) por cada 5° de azimute.
export function useTerrainHorizon(home: LatLon) {
  const key = `${home.lat.toFixed(3)},${home.lon.toFixed(3)}`;
  const [h, setH] = useState<number[] | null>(cache.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (cache.has(key)) { setH(cache.get(key)!); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const pts: LatLon[] = [home];
      for (let az = 0; az < 360; az += AZ_STEP) for (const d of DISTS) pts.push(destination(home, az, d));
      const elev: number[] = [];
      for (let i = 0; i < pts.length; i += 100) {
        const chunk = pts.slice(i, i + 100);
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(5)).join(',')}&longitude=${chunk.map((p) => p.lon.toFixed(5)).join(',')}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('elev');
        elev.push(...((await r.json()) as { elevation: number[] }).elevation);
      }
      const h0 = elev[0] + 1.7;
      const out: number[] = [];
      let k = 1;
      for (let az = 0; az < 360; az += AZ_STEP) {
        let max = -0.5;
        for (const d of DISTS) {
          const drop = ((d * 1000) ** 2 / (2 * 6371000)) * 0.87; // curvatura + refração
          max = Math.max(max, (Math.atan2(elev[k++] - h0 - drop, d * 1000) * 180) / Math.PI);
        }
        out.push(max);
      }
      cache.set(key, out);
      if (alive) setH(out);
    })().catch(() => alive && setH(null)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { horizon: h, loading };
}

export function horizonAt(h: number[] | null, az: number) {
  if (!h) return 0;
  const a = ((az % 360) + 360) % 360 / AZ_STEP;
  const i = Math.floor(a), f = a - i;
  return h[i % h.length] * (1 - f) + h[(i + 1) % h.length] * f;
}
