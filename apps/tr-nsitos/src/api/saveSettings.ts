import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Guarda as definições do observador do utilizador',
  inputSchema: z.object({
    useGps: z.boolean(),
    latitude: z.number(),
    longitude: z.number(),
    defaultTarget: z.enum(['Sol', 'Lua']),
    marginDegrees: z.number(),
    maxTravelKm: z.number(),
    minElevationDegrees: z.number(),
    focalLengthMm: z.number(),
    sensor: z.string(),
    issAlertMinutes: z.number(),
    aircraftAlertSeconds: z.number(),
    voiceAlerts: z.boolean(),
    aircraftOffsetPercent: z.number(),
    issOffsetPercent: z.number(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await zite.observerSettings.bulkCreate({
      records: [{ ...input, profileName: context.user.email, owner: context.user.id }],
      matchOn: ['owner'],
    });
    return { success: true };
  },
});
