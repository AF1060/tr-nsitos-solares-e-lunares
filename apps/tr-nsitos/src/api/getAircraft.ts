import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';

let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  const env = process.env as Record<string, string | undefined>;
  const id = env.ZITE_OPENSKY_CLIENT_ID;
  const secret = env.ZITE_OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  const res = await fetch(
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
    rateLimited: z.boolean(),
    remaining: z.number().nullable(),
    time: z.number(),
  }),
  execute: async ({ input }) => {
    const dLat = input.radiusKm / 111;
    const dLon = input.radiusKm / (111 * Math.cos((input.lat * Math.PI) / 180));
    const url = `https://opensky-network.org/api/states/all?lamin=${input.lat - dLat}&lomin=${input.lon - dLon}&lamax=${input.lat + dLat}&lomax=${input.lon + dLon}`;
    const token = await getToken();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const remainingHeader = res.headers.get('X-Rate-Limit-Remaining');
    const remaining = remainingHeader ? Number(remainingHeader) : null;
    if (res.status === 429) {
      return { planes: [], authenticated: !!token, rateLimited: true, remaining, time: Date.now() / 1000 };
    }
    if (!res.ok) {
      console.error('OpenSky states error', res.status, await res.text());
      throw new Error(`OpenSky respondeu ${res.status}`);
    }
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
    return { planes, authenticated: !!token, rateLimited: false, remaining, time: j.time };
  },
});
