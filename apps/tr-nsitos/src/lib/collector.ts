import { zite } from 'zitejs/db';
import { bodyTopo, Target } from './astro';
import { DEG, destination, haversineKm, LatLon } from './geo';

const RADAR_KM = 120;
const RADIUS = 50; // km à volta de casa onde o alinhamento interessa

interface P { icao24: string; callsign: string; lat: number; lon: number; altM: number; velocity: number; track: number; posTime: number }

function lisbonParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday as string), minuteOfDay: Number(p.hour) * 60 + Number(p.minute) };
}

// O adsb.lol permite 500 pedidos/dia. O coletor deixa sempre uma reserva para o radar em direto.
const RESERVE = 250;
let pausedUntil = 0;

async function fetchPlanes(home: LatLon): Promise<P[] | null> {
  if (Date.now() < pausedUntil) return null;
  const nm = Math.ceil(RADAR_KM / 1.852);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(`https://api.adsb.lol/v2/point/${home.lat.toFixed(4)}/${home.lon.toFixed(4)}/${nm}`, { signal: c.signal });
    const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
    const resetS = Number(res.headers.get('x-ratelimit-reset') ?? 3600);
    if (res.status === 429 || (Number.isFinite(remaining) && remaining < RESERVE)) pausedUntil = Date.now() + resetS * 1000;
    if (res.status === 429) return null;
    if (!res.ok) throw new Error(`adsb.lol respondeu ${res.status}`);
    const j = (await res.json()) as { now: number; ac?: Record<string, unknown>[] };
    const nowS = j.now / 1000;
    return (j.ac ?? [])
      .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground' && typeof a.gs === 'number')
      .map((a) => ({
        icao24: String(a.hex),
        callsign: String(a.flight ?? '').trim() || String(a.r ?? a.hex).toUpperCase(),
        lat: Number(a.lat), lon: Number(a.lon),
        altM: Number(a.alt_geom ?? a.alt_baro ?? 0) * 0.3048,
        velocity: Number(a.gs) * 0.514444,
        track: Number(a.track ?? a.true_heading ?? 0),
        posTime: nowS - Number(a.seen_pos ?? 0),
      }));
  } finally { clearTimeout(t); }
}

/** O avião pode alinhar com o corpo a partir de um ponto a menos de RADIUS km de casa, nos próximos ±150 s? */
function relevant(p: P, home: LatLon, up: { body: Target; az: number; el: number }[]) {
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
  const out: { owner: string; seen: number; saved: number; skipped?: string }[] = [];
  for (const s of all) {
    const owner = (Array.isArray(s.owner) ? s.owner[0] : s.owner) as string | undefined;
    if (!owner) continue;
    const home = { lat: s.latitude ?? 38.7223, lon: s.longitude ?? -9.1393 };
    const minEl = s.minElevationDegrees ?? 10;
    const up = (['Sol', 'Lua'] as const)
      .map((body) => ({ body, ...bodyTopo(body, now, home) }))
      .filter((b) => b.el >= minEl);
    if (!up.length) { out.push({ owner, seen: 0, saved: 0, skipped: 'Sol e Lua abaixo da elevação mínima' }); continue; }

    const fetched = await fetchPlanes(home);
    if (!fetched) { out.push({ owner, seen: 0, saved: 0, skipped: 'Limite diário do adsb.lol (a respeitar a reserva)' }); continue; }
    const planes = fetched
      .filter((p) => p.altM > 1500 && p.velocity > 60 && /^[A-Z]{3}\d/.test(p.callsign) && relevant(p, home, up));
    const records = planes.map((p) => {
      const d = new Date(p.posTime * 1000);
      return {
        callsign: p.callsign, icao24: p.icao24, airline: p.callsign.slice(0, 3), seenAt: d.toISOString(), ...lisbonParts(d),
        latitude: p.lat, longitude: p.lon, altitudeM: Math.round(p.altM), track: Math.round(p.track), speed: p.velocity, owner,
      };
    });
    if (!dryRun) for (let i = 0; i < records.length; i += 100) await zite.aircraftSightings.bulkCreate({ records: records.slice(i, i + 100) });
    out.push({ owner, seen: planes.length, saved: dryRun ? 0 : records.length });
  }
  return out;
}
