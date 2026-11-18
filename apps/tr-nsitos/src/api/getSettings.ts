import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Lê as definições do observador do utilizador',
  inputSchema: z.object({}),
  outputSchema: z.object({
    settings: z
      .object({
        useGps: z.boolean(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        defaultTarget: z.string(),
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
      })
      .nullable(),
  }),
  execute: async ({ context }) => {
    const r = await zite.observerSettings.findOne({ filters: { owner: context.user.id } });
    if (!r) return { settings: null };
    return {
      settings: {
        useGps: r.useGps ?? true,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        defaultTarget: r.defaultTarget ?? 'Sol',
        marginDegrees: r.marginDegrees ?? 2,
        maxTravelKm: r.maxTravelKm ?? 30,
        minElevationDegrees: r.minElevationDegrees ?? 10,
        focalLengthMm: r.focalLengthMm ?? 600,
        sensor: r.sensor ?? 'Micro 4/3',
        issAlertMinutes: r.issAlertMinutes ?? 15,
        aircraftAlertSeconds: r.aircraftAlertSeconds ?? 60,
        voiceAlerts: r.voiceAlerts ?? true,
        aircraftOffsetPercent: r.aircraftOffsetPercent ?? 80,
        issOffsetPercent: r.issOffsetPercent ?? 67,
      },
    };
  },
});
