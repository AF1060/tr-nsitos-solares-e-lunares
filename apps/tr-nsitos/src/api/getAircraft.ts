import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';

async function fetchTimeout(url: string, init: RequestInit = {}, ms = 6000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(id); }
}

async function fromAdsbLol(lat: number, lon: number, radiusKm: number) {
  const nm = Math.min(250, Math.ceil(radiusKm / 1.852));
  const res = await fetchTimeout(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`, {}, 8000);
  if (!res.ok) throw new Error(`adsb.lol respondeu ${res.status}`);
  const j = (await res.json()) as { now: number; ac?: Record<string, unknown>[] };
  const nowS = j.now / 1000;
  const planes = (j.ac ?? [])
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground' && typeof a.gs === 'number')
    .map((a) => {
      const altFt = Number(a.alt_geom ?? a.alt_baro ?? 0);
      return {
        icao24: String(a.hex),
        callsign: String(a.flight ?? '').trim() || String(a.r ?? a.hex).toUpperCase(),
        country: String(a.t ?? ''),
        posTime: nowS - Number(a.seen_pos ?? 0),
        lat: Number(a.lat),
        lon: Number(a.lon),
        altM: altFt * 0.3048,
        velocity: Number(a.gs) * 0.514444,
        track: Number(a.track ?? a.true_heading ?? 0),
        vrate: (Number(a.geom_rate ?? a.baro_rate ?? 0) * 0.3048) / 60,
      };
    });
  return { planes, time: nowS };
}

const plane = z.object({
  icao24: z.string(),
  callsign: z.string(),
  country: z.string(),
  posTime: z.number(),
  lat: z.number(),
  lon: z.number(),
  altM: z.number(),
  velocity: z.number(),
  track: z.number(),
  vrate: z.number(),
});

export default createEndpoint({
  description: 'Obtém os aviões num raio à volta do observador (adsb.lol)',
  inputSchema: z.object({ lat: z.number(), lon: z.number(), radiusKm: z.number() }),
  outputSchema: z.object({ planes: z.array(plane), source: z.string(), time: z.number() }),
  execute: async ({ input }) => {
    const r = await fromAdsbLol(input.lat, input.lon, input.radiusKm);
    return { ...r, source: 'adsb.lol' };
  },
});
