export interface Weather {
  current: { cloud: number; rain: number };
  hourly: Map<number, { cloud: number; rainProb: number; rain: number }>;
}

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=cloud_cover,precipitation_probability,precipitation&current=cloud_cover,precipitation&forecast_days=11&timezone=GMT&timeformat=unixtime`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Open-Meteo indisponível');
  const j = await r.json();
  const hourly = new Map<number, { cloud: number; rainProb: number; rain: number }>();
  (j.hourly.time as number[]).forEach((t, i) => {
    hourly.set(t * 1000, {
      cloud: j.hourly.cloud_cover[i] ?? 0,
      rainProb: j.hourly.precipitation_probability[i] ?? 0,
      rain: j.hourly.precipitation[i] ?? 0,
    });
  });
  return { current: { cloud: j.current.cloud_cover ?? 0, rain: j.current.precipitation ?? 0 }, hourly };
}

export function weatherAt(w: Weather | null, t: number) {
  if (!w) return null;
  const h = Math.round(t / 3600_000) * 3600_000;
  return w.hourly.get(h) ?? null;
}

export function qualityOf(o: { el: number; cloud: number | null; rainProb: number | null; durationS: number; distKm: number; maxKm: number }) {
  const elS = (Math.min(Math.max(o.el, 0), 45) / 45) * 30;
  const cl = o.cloud === null ? 20 : ((100 - o.cloud) / 100) * 40;
  const rn = o.rainProb === null ? 8 : ((100 - o.rainProb) / 100) * 15;
  const tr = (1 - Math.min(o.distKm / Math.max(o.maxKm, 1), 1)) * 10;
  const du = Math.min(o.durationS, 1.5) / 1.5 * 5;
  const score = Math.round(elS + cl + rn + tr + du);
  const label = score >= 75 ? 'Excelente' : score >= 55 ? 'Boa' : score >= 35 ? 'Razoável' : 'Fraca';
  return { score, label };
}
