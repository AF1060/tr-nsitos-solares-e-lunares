import type { Plane } from './aircraft';

// Pedido feito diretamente do telemóvel/navegador à OpenSky (modo anónimo).
export async function fetchOpenSkyBrowser(lat: number, lon: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const url = `https://opensky-network.org/api/states/all?lamin=${(lat - dLat).toFixed(4)}&lomin=${(lon - dLon).toFixed(4)}&lamax=${(lat + dLat).toFixed(4)}&lomax=${(lon + dLon).toFixed(4)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7000);
  try {
    const res = await fetch(url, { signal: c.signal });
    const rem = res.headers.get('X-Rate-Limit-Remaining');
    if (res.status === 429) {
      const retry = Number(res.headers.get('X-Rate-Limit-Retry-After-Seconds') ?? 3600);
      throw Object.assign(new Error('limite'), { retryAfter: retry });
    }
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const j = (await res.json()) as { time: number; states: unknown[][] | null };
    const planes = (j.states ?? [])
      .filter((s) => s[5] != null && s[6] != null && !s[8])
      .map((s) => ({
        icao24: String(s[0]),
        callsign: String(s[1] ?? '').trim() || String(s[0]).toUpperCase(),
        country: String(s[2] ?? ''),
        posTime: Number(s[3] ?? s[4] ?? j.time),
        lon: Number(s[5]),
        lat: Number(s[6]),
        altM: Number(s[13] ?? s[7] ?? 0),
        velocity: Number(s[9] ?? 0),
        track: Number(s[10] ?? 0),
        vrate: Number(s[11] ?? 0),
      })) as Plane[];
    return { planes, remaining: rem ? Number(rem) : null };
  } finally {
    clearTimeout(t);
  }
}
