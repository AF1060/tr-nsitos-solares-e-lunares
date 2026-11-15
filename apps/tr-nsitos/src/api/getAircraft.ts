import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';

let openskyDownUntil = 0;

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

let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  const env = process.env as Record<string, string | undefined>;
  // Accept values pasted as JSON fragments, e.g. "clientId":"abc"
  const clean = (v: string | undefined, key: string) => {
    if (!v) return v;
    const m = v.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return (m ? m[1] : v).trim().replace(/^"|"$/g, '');
  };
  const id = clean(env.ZITE_OPENSKY_CLIENT_ID, 'clientId');
  const secret = clean(env.ZITE_OPENSKY_CLIENT_SECRET, 'clientSecret');
  if (!id || !secret) return null;
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  const res = await fetchTimeout(
    'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    },
  );
  if (!res.ok) {
    console.error('OpenSky token error', res.status, await res.text());
    return null;
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
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
  description: 'Obtém os aviões num raio à volta do observador (OpenSky Network)',
  inputSchema: z.object({ lat: z.number(), lon: z.number(), radiusKm: z.number() }),
  outputSchema: z.object({
    planes: z.array(plane),
    authenticated: z.boolean(),
    source: z.string(),
    rateLimited: z.boolean(),
    remaining: z.number().nullable(),
    time: z.number(),
  }),
  execute: async ({ input }) => {
    if (Date.now() > openskyDownUntil) {
      try {
        return await fromOpenSky(input);
      } catch (e) {
        console.error('OpenSky indisponível, a usar adsb.lol', e);
        openskyDownUntil = Date.now() + 10 * 60_000;
      }
    }
    const r = await fromAdsbLol(input.lat, input.lon, input.radiusKm);
    return { ...r, authenticated: false, rateLimited: false, remaining: null, source: 'adsb.lol' };
  },
});

async function fromOpenSky(input: { lat: number; lon: number; radiusKm: number }) {
    const dLat = input.radiusKm / 111;
    const dLon = input.radiusKm / (111 * Math.cos((input.lat * Math.PI) / 180));
    const url = `https://opensky-network.org/api/states/all?lamin=${input.lat - dLat}&lomin=${input.lon - dLon}&lamax=${input.lat + dLat}&lomax=${input.lon + dLon}`;
    const token = await getToken();
    const res = await fetchTimeout(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const remainingHeader = res.headers.get('X-Rate-Limit-Remaining');
    const remaining = remainingHeader ? Number(remainingHeader) : null;
    if (res.status === 429) throw new Error('OpenSky: limite atingido');
    if (!res.ok) throw new Error(`OpenSky respondeu ${res.status}`);
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
      }));
    return { planes, authenticated: !!token, rateLimited: false, remaining, time: j.time, source: 'OpenSky' };
}
