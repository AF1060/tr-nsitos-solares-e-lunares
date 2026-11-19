import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { fetchPlanes } from '../lib/aircraftSources';

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
  description: 'Obtém os aviões num raio à volta do observador (adsb.lol, com saldo partilhado e adsb.fi como reserva)',
  inputSchema: z.object({ lat: z.number(), lon: z.number(), radiusKm: z.number() }),
  outputSchema: z.object({
    planes: z.array(plane),
    source: z.string(),
    time: z.number(),
    remaining: z.number().nullable(),
    resetAt: z.number().nullable(),
  }),
  execute: async ({ input }) => {
    const r = await fetchPlanes(input.lat, input.lon, input.radiusKm);
    return { ...r, remaining: r.remaining ?? null, resetAt: r.resetAt ?? null };
  },
});
