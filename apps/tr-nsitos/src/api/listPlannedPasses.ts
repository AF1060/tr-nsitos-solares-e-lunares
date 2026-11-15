import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Lista as passagens com alarme do utilizador',
  inputSchema: z.object({}),
  outputSchema: z.object({
    passes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        object: z.string(),
        target: z.string(),
        discEntryTime: z.string(),
        secondsInDisc: z.number(),
        siteLatitude: z.number(),
        siteLongitude: z.number(),
        quality: z.string(),
        alarmEnabled: z.boolean(),
      }),
    ),
  }),
  execute: async ({ context }) => {
    const { records } = await zite.plannedPasses.findAll({
      filters: { owner: context.user.id },
      sort: [{ field: 'discEntryTime', direction: 'asc' }],
      limit: 200,
    });
    const cutoff = Date.now() - 3600_000;
    return {
      passes: records
        .filter((r) => r.discEntryTime && new Date(r.discEntryTime).getTime() > cutoff)
        .map((r) => ({
          id: r.id,
          title: r.title ?? '',
          object: r.object ?? 'ISS',
          target: r.target ?? 'Sol',
          discEntryTime: r.discEntryTime!,
          secondsInDisc: r.secondsInDisc ?? 0,
          siteLatitude: r.siteLatitude ?? 0,
          siteLongitude: r.siteLongitude ?? 0,
          quality: r.quality ?? '',
          alarmEnabled: r.alarmEnabled ?? true,
        })),
    };
  },
});
