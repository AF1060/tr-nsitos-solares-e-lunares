import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Guarda observações de aviões para as estatísticas de rotas',
  inputSchema: z.object({
    sightings: z.array(z.object({
      callsign: z.string(), icao24: z.string(), airline: z.string(), seenAt: z.string(),
      weekday: z.number(), minuteOfDay: z.number(), latitude: z.number(), longitude: z.number(),
      altitudeM: z.number(), track: z.number(), speed: z.number(),
    })),
  }),
  outputSchema: z.object({ saved: z.number() }),
  execute: async ({ input, context }) => {
    const recs = input.sightings.slice(0, 300).map((s) => ({ ...s, owner: context.user.id }));
    for (let i = 0; i < recs.length; i += 100) await zite.aircraftSightings.bulkCreate({ records: recs.slice(i, i + 100) });
    return { saved: recs.length };
  },
});
