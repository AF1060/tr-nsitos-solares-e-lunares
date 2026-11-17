import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Marca uma passagem com alarme',
  inputSchema: z.object({
    title: z.string(),
    object: z.enum(['ISS', 'Avião']),
    target: z.enum(['Sol', 'Lua']),
    discEntryTime: z.string(),
    secondsInDisc: z.number(),
    siteLatitude: z.number(),
    siteLongitude: z.number(),
    quality: z.string(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    const r = await zite.plannedPasses.create({
      record: { ...input, owner: context.user.id, alarmEnabled: true },
    });
    return { id: r.id };
  },
});
