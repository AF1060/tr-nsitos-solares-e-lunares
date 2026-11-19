// Lógica de parsing partilhada entre o backend (aircraftSources.ts) e o browser
// (aircraftBrowser.ts), para as respostas no formato tar1090 (adsb.lol, adsb.fi,
// airplanes.live, ...). Não importa nada do zitejs/db, por isso corre em qualquer lado.

export interface RawPlane {
  icao24: string; callsign: string; country: string; posTime: number;
  lat: number; lon: number; altM: number; velocity: number; track: number; vrate: number;
}

export async function fetchTimeout(url: string, ms = 8000, headers?: Record<string, string>) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers }); } finally { clearTimeout(t); }
}

export function parseTar1090(j: { now: number; ac?: Record<string, unknown>[] }): { planes: RawPlane[]; time: number } {
  const nowS = j.now / 1000;
  const planes = (j.ac ?? [])
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground' && typeof a.gs === 'number')
    .map((a) => ({
      icao24: String(a.hex),
      callsign: String(a.flight ?? '').trim() || String(a.r ?? a.hex).toUpperCase(),
      country: String(a.t ?? ''),
      posTime: nowS - Number(a.seen_pos ?? 0),
      lat: Number(a.lat), lon: Number(a.lon),
      altM: Number(a.alt_geom ?? a.alt_baro ?? 0) * 0.3048,
      velocity: Number(a.gs) * 0.514444,
      track: Number(a.track ?? a.true_heading ?? 0),
      vrate: (Number(a.geom_rate ?? a.baro_rate ?? 0) * 0.3048) / 60,
    }));
  return { planes, time: nowS };
}
