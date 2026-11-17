import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Devolve as observações de aviões num intervalo horário (e dia da semana) para estatística',
  inputSchema: z.object({ minFrom: z.number(), minTo: z.number(), weekday: z.number().nullable() }),
  outputSchema: z.object({
    totalSightings: z.number(),
    daysObserved: z.number(),
    firstDay: z.string().nullable(),
    rows: z.array(z.object({
      callsign: z.string(), airline: z.string(), weekday: z.number(), minuteOfDay: z.number(), day: z.string(),
      latitude: z.number(), longitude: z.number(), altitudeM: z.number(), track: z.number(), speed: z.number(),
    })),
  }),
  execute: async ({ input, context }) => {
    const totals = await zite.sql({
      query: `SELECT COUNT(*) AS n, COUNT(DISTINCT to_char("seenAt" AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD')) AS days,
                MIN(to_char("seenAt" AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD')) AS first
              FROM "AircraftSightings" WHERE "owner"->>0 = $1`,
      params: [context.user.id],
    });
    const r = await zite.sql({
      query: `SELECT "callsign", "airline", "weekday", "minuteOfDay", "latitude", "longitude", "altitudeM", "track", "speed",
                to_char("seenAt" AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD') AS day
              FROM "AircraftSightings"
              WHERE "owner"->>0 = $1 AND "minuteOfDay" BETWEEN $2 AND $3 AND ($4::int IS NULL OR "weekday" = $4::int)
                AND "altitudeM" > 1500
              ORDER BY "seenAt" DESC LIMIT 2000`,
      params: [context.user.id, input.minFrom, input.minTo, input.weekday],
    });
    const t = totals.rows[0] ?? {};
    return {
      totalSightings: Number(t.n ?? 0),
      daysObserved: Number(t.days ?? 0),
      firstDay: t.first ? String(t.first) : null,
      rows: r.rows.map((x) => ({
        callsign: String(x.callsign ?? ''), airline: String(x.airline ?? ''), weekday: Number(x.weekday), minuteOfDay: Number(x.minuteOfDay), day: String(x.day),
        latitude: Number(x.latitude), longitude: Number(x.longitude), altitudeM: Number(x.altitudeM), track: Number(x.track), speed: Number(x.speed),
      })),
    };
  },
});
