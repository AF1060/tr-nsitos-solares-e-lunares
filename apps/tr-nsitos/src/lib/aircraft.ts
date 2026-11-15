import { bodyTopo, Target } from './astro';
import { LatLon, destination, geodeticToEcef, enuVec, skyOffset, len, haversineKm, bearingDeg } from './geo';
import type { SkyPoint } from './iss';

export interface Plane {
  icao24: string;
  callsign: string;
  country: string;
  posTime: number;
  lat: number;
  lon: number;
  altM: number;
  velocity: number;
  track: number;
  vrate: number;
}

export interface PlanePrediction {
  plane: Plane;
  closest: number;
  minSep: number;
  entry: number | null;
  marginEntry: number | null;
  inDiscS: number;
  errDeg: number;
  errS: number;
  rangeKm: number;
  confidence: 'alta' | 'média' | 'baixa';
  radiusDeg: number;
}

export function planeAt(p: Plane, t: number): LatLon & { altKm: number } {
  const dt = t / 1000 - p.posTime;
  const pos = destination(p, p.track, (p.velocity * dt) / 1000);
  return { ...pos, altKm: Math.max(0, p.altM + p.vrate * dt) / 1000 };
}

export function planeOffset(p: Plane, t: number, home: LatLon, target: Target) {
  const oe = geodeticToEcef(home.lat, home.lon, 0);
  const pos = planeAt(p, t);
  const v = enuVec(home, oe, geodeticToEcef(pos.lat, pos.lon, pos.altKm));
  const body = bodyTopo(target, new Date(t), home);
  return { ...skyOffset(body.enu, v), range: len(v), body };
}

export const errorModel = (dtS: number, v: number, rangeKm: number) => {
  const errKm = 0.15 + ((v * dtS) / 1000) * 0.03;
  return { errDeg: (Math.atan(errKm / Math.max(rangeKm, 1)) * 180) / Math.PI, errS: 1 + 0.03 * dtS };
};

export function predict(p: Plane, home: LatLon, target: Target, marginDeg: number, now: number, horizonS = 600): PlanePrediction | null {
  const body0 = bodyTopo(target, new Date(now), home);
  if (body0.el < 0) return null;
  let best = { sep: Infinity, t: now };
  for (let t = now; t <= now + horizonS * 1000; t += 1000) {
    const s = planeOffset(p, t, home, target);
    if (s.sep < best.sep) best = { sep: s.sep, t };
  }
  for (let t = best.t - 1000; t <= best.t + 1000; t += 50) {
    const s = planeOffset(p, t, home, target);
    if (s.sep < best.sep) best = { sep: s.sep, t };
  }
  const at = planeOffset(p, best.t, home, target);
  const r = at.body.radiusDeg;
  const { errDeg, errS } = errorModel((best.t - now) / 1000, p.velocity, at.range);
  if (best.sep > r + marginDeg + errDeg) return null;
  let entry: number | null = null, exit: number | null = null, marginEntry: number | null = null;
  for (let t = best.t - 120_000; t <= best.t + 120_000; t += 50) {
    if (t < now - 5000) continue;
    const s = planeOffset(p, t, home, target);
    if (s.sep <= r + marginDeg && marginEntry === null) marginEntry = t;
    if (s.sep <= r) { if (entry === null) entry = t; exit = t; }
  }
  const confidence = best.sep + errDeg <= r ? 'alta' : best.sep <= r + marginDeg / 2 ? 'média' : 'baixa';
  return {
    plane: p, closest: best.t, minSep: best.sep, entry, marginEntry,
    inDiscS: entry !== null && exit !== null ? (exit - entry) / 1000 : 0,
    errDeg, errS, rangeKm: at.range, confidence, radiusDeg: r,
  };
}

export function planeTrack(p: Plane, home: LatLon, target: Target, center: number, maxDeg: number): SkyPoint[] {
  const pts: SkyPoint[] = [];
  for (let t = center - 90_000; t <= center + 90_000; t += 100) {
    const s = planeOffset(p, t, home, target);
    if (Math.abs(s.x) <= maxDeg && Math.abs(s.y) <= maxDeg) pts.push({ t, x: s.x, y: s.y });
  }
  return pts;
}

export const planePolar = (p: Plane, home: LatLon) => ({ dist: haversineKm(home, p), brg: bearingDeg(home, p) });
