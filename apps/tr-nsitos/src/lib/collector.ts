import { zite } from 'zitejs/db';
import { bodyTopo, Target } from './astro';
import { DEG, destination, haversineKm, LatLon } from './geo';
import { fetchPlanes, RawPlane } from './aircraftSources';

const RADAR_KM = 120;
const RADIUS = 50; // km à volta de casa onde o alinhamento interessa

function lisbonParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday as string), minuteOfDay: Number(p.hour) * 60 + Number(p.minute) };
}

/** O avião pode alinhar com o corpo a partir de um ponto a menos de RADIUS km de casa, nos próximos ±150 s? */
function relevant(p: RawPlane, home: LatLon, up: { body: Target; az: number; el: number }[]) {
  for (const b of up) {
    const back = (b.az + 180) % 360;
    const d = p.altM / 1000 / Math.tan(b.el * DEG);
    if (d > 300) continue;
    for (let s = -150; s <= 150; s += 15) {
      const pt = destination(p, p.track, (p.velocity * s) / 1000);
      if (haversineKm(home, destination(pt, back, d)) <= RADIUS) return true;
    }
  }
  return false;
}

export async function collectOnce(dryRun = false) {
  const { records: all } = await zite.observerSettings.findAll({ limit: 3 });
  const now = new Date();
  const out: { owner: string; seen: number; saved: number; source?: string; skipped?: string }[] = [];
  for (const s of all) {
    const owner = (Array.isArray(s.owner) ? s.owner[0] : s.owner) as string | undefined;
    if (!owner) continue;
    const home = { lat: s.latitude ?? 38.7223, lon: s.longitude ?? -9.1393 };
    const minEl = s.minElevationDegrees ?? 10;
    const up = (['Sol', 'Lua'] as const)
      .map((body) => ({ body, ...bodyTopo(body, now, home) }))
      .filter((b) => b.el >= minEl);
    if (!up.length) { out.push({ owner, seen: 0, saved: 0, skipped: 'Sol e Lua abaixo da elevação mínima' }); continue; }

    let fetched: Awaited<ReturnType<typeof fetchPlanes>>;
    try {
      fetched = await fetchPlanes(home.lat, home.lon, RADAR_KM);
    } catch (e) {
      out.push({ owner, seen: 0, saved: 0, skipped: `Sem fontes disponíveis (${e instanceof Error ? e.message : 'erro'})` });
      continue;
    }
    const planes = fetched.planes
      .filter((p) => p.altM > 1500 && p.velocity > 60 && /^[A-Z]{3}\d/.test(p.callsign) && relevant(p, home, up));
    const records = planes.map((p) => {
      const d = new Date(p.posTime * 1000);
      return {
        callsign: p.callsign, icao24: p.icao24, airline: p.callsign.slice(0, 3), seenAt: d.toISOString(), ...lisbonParts(d),
        latitude: p.lat, longitude: p.lon, altitudeM: Math.round(p.altM), track: Math.round(p.track), speed: p.velocity, owner,
      };
    });
    if (!dryRun) for (let i = 0; i < records.length; i += 100) await zite.aircraftSightings.bulkCreate({ records: records.slice(i, i + 100) });
    out.push({ owner, seen: planes.length, saved: dryRun ? 0 : records.length, source: fetched.source });
  }
  return out;
}
