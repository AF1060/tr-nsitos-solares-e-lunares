import { logSightings } from 'zitejs/api';
import type { Plane } from './aircraft';

const lastLogged = new Map<string, number>();
const EVERY = 5 * 60_000; // cada avião no máximo uma vez a cada 5 min

function lisbonParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday as string); // 0 = segunda
  return { weekday: wd, minuteOfDay: Number(p.hour) * 60 + Number(p.minute) };
}

export function recordPlanes(planes: Plane[]) {
  const now = Date.now();
  const fresh = planes.filter((p) => p.altM > 1500 && p.velocity > 60 && /^[A-Z]{3}\d/.test(p.callsign) && now - (lastLogged.get(p.icao24) ?? 0) > EVERY);
  if (!fresh.length) return;
  fresh.forEach((p) => lastLogged.set(p.icao24, now));
  const sightings = fresh.map((p) => {
    const d = new Date(p.posTime * 1000);
    return {
      callsign: p.callsign, icao24: p.icao24, airline: p.callsign.slice(0, 3), seenAt: d.toISOString(), ...lisbonParts(d),
      latitude: p.lat, longitude: p.lon, altitudeM: Math.round(p.altM), track: Math.round(p.track), speed: p.velocity,
    };
  });
  logSightings({ sightings }).catch(() => fresh.forEach((p) => lastLogged.delete(p.icao24)));
}

export { lisbonParts };
