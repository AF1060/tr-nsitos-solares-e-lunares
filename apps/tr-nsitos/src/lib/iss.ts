import * as satellite from 'satellite.js';
import { bodyEcefKm, bodyTopo, Target } from './astro';
import {
  DEG, Vec, LatLon, sub, norm, dot, rayEarth, segDist, geodeticToEcef, ecefToGeodetic, enuVec,
  skyOffset, len, haversineKm, bearingDeg,
} from './geo';
import { offsetBand, OffsetBand } from './offset';

export type SatRec = satellite.SatRec;
export const makeSat = (l1: string, l2: string) => satellite.twoline2satrec(l1, l2);

export function issEcef(sat: SatRec, date: Date): Vec | null {
  const pv = satellite.propagate(sat, date);
  if (!pv.position || typeof pv.position === 'boolean') return null;
  const e = satellite.eciToEcf(pv.position, satellite.gstime(date));
  return [e.x, e.y, e.z];
}

export interface SkyPoint { t: number; x: number; y: number }

export interface Analysis {
  minSep: number;
  tMin: number;
  entry: number | null;
  exit: number | null;
  duration: number;
  issRangeKm: number;
  bodyEl: number;
  bodyAz: number;
  radiusDeg: number;
}

function sampleAt(sat: SatRec, target: Target, obs: LatLon, oe: Vec, t: number) {
  const date = new Date(t);
  const iss = issEcef(sat, date);
  if (!iss) return null;
  const vb = enuVec(obs, oe, bodyEcefKm(target, date));
  const vi = enuVec(obs, oe, iss);
  return { ...skyOffset(vb, vi), range: len(vi) };
}

/** Analyse the passage at an observer around a centre time. */
export function analyzeAt(sat: SatRec, target: Target, obs: LatLon, center: number, halfS = 20, stepS = 0.01): Analysis {
  const oe = geodeticToEcef(obs.lat, obs.lon, 0);
  const body = bodyTopo(target, new Date(center), obs);
  const r = body.radiusDeg;
  let minSep = Infinity, tMin = center, entry: number | null = null, exit: number | null = null, range = 0;
  for (let t = center - halfS * 1000; t <= center + halfS * 1000; t += stepS * 1000) {
    const s = sampleAt(sat, target, obs, oe, t);
    if (!s) continue;
    if (s.sep < minSep) { minSep = s.sep; tMin = t; range = s.range; }
    if (s.sep <= r) { if (entry === null) entry = t; exit = t; }
  }
  return {
    minSep, tMin, entry, exit, duration: entry !== null && exit !== null ? (exit - entry) / 1000 + stepS : 0,
    issRangeKm: range, bodyEl: body.el, bodyAz: body.az, radiusDeg: r,
  };
}

export function skyTrack(sat: SatRec, target: Target, obs: LatLon, center: number, maxDeg: number): SkyPoint[] {
  const oe = geodeticToEcef(obs.lat, obs.lon, 0);
  const pts: SkyPoint[] = [];
  for (let t = center - 30_000; t <= center + 30_000; t += 20) {
    const s = sampleAt(sat, target, obs, oe, t);
    if (s && Math.abs(s.x) <= maxDeg && Math.abs(s.y) <= maxDeg) pts.push({ t, x: s.x, y: s.y });
  }
  return pts;
}

function centerGround(sat: SatRec, target: Target, date: Date): Vec | null {
  const iss = issEcef(sat, date);
  if (!iss) return null;
  return rayEarth(iss, norm(sub(iss, bodyEcefKm(target, date))));
}

export interface IssTransit {
  id: string;
  target: Target;
  center: number;
  site: LatLon;
  siteDistKm: number;
  siteBearing: number;
  atSite: Analysis;
  atHome: Analysis;
  /** centro = linha central; abaixo/acima = limite da faixa (passagem dentro da fração escolhida do raio do centro). */
  siteOffset: 'centro' | 'abaixo' | 'acima';
  band: OffsetBand | null;
}

export interface SearchOptions {
  home: LatLon;
  maxTravelKm: number;
  minElevDeg: number;
  /** Fração do raio do disco (0–1) até à qual a passagem ainda serve. */
  offsetFrac?: number;
  days: number;
  onProgress?: (p: number) => void;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function searchTransits(sat: SatRec, target: Target, o: SearchOptions): Promise<IssTransit[]> {
  const home = o.home;
  const he = geodeticToEcef(home.lat, home.lon, 0);
  const up = norm(he);
  const start = Date.now();
  const end = start + o.days * 86400_000;
  const step = 5000;
  const minSin = Math.sin((o.minElevDeg - 3) * DEG);
  const out: IssTransit[] = [];
  let prevG: Vec | null = null;
  let prevT = 0;
  let i = 0;
  for (let t = start; t < end; t += step) {
    if (++i % 4000 === 0) { o.onProgress?.((t - start) / (end - start)); await tick(); }
    const date = new Date(t);
    const b = bodyEcefKm(target, date);
    if (dot(norm(sub(b, he)), up) < minSin) { prevG = null; continue; }
    const G = centerGround(sat, target, date);
    if (!G) { prevG = null; continue; }
    if (prevG && segDist(he, prevG, G) <= o.maxTravelKm + 12) {
      const found = refine(sat, target, o, he, prevT - 3 * step, t + 3 * step);
      if (found) { out.push(found); t += 180_000; prevG = null; continue; }
    }
    prevG = G;
    prevT = t;
  }
  o.onProgress?.(1);
  return out;
}

function refine(sat: SatRec, target: Target, o: SearchOptions, he: Vec, t0: number, t1: number): IssTransit | null {
  let best = Infinity, bestT = t0;
  const scan = (a: number, b: number, s: number) => {
    for (let t = a; t <= b; t += s) {
      const G = centerGround(sat, target, new Date(t));
      if (!G) continue;
      const d = len(sub(G, he));
      if (d < best) { best = d; bestT = t; }
    }
  };
  scan(t0, t1, 50);
  scan(bestT - 60, bestT + 60, 2);
  const G = centerGround(sat, target, new Date(bestT));
  if (!G) return null;
  const g = ecefToGeodetic(G);
  const centre = { lat: g.lat, lon: g.lon };
  const date = new Date(bestT);
  const i0 = issEcef(sat, date), i1 = issEcef(sat, new Date(bestT + 1000));
  const band = i0 && i1
    ? offsetBand(i0, sub(i1, i0), bodyEcefKm(target, date), bodyTopo(target, date, centre).radiusDeg, norm(geodeticToEcef(centre.lat, centre.lon, 0)), o.offsetFrac)
    : null;
  let site: LatLon = centre;
  let siteOffset: IssTransit['siteOffset'] = 'centro';
  let dist = haversineKm(o.home, centre);
  if (dist > o.maxTravelKm) {
    // A linha central fica fora do alcance, mas a faixa escolhida pode chegar lá.
    if (!band) return null;
    const edges = ([['abaixo', band.below], ['acima', band.above]] as const)
      .map(([k, pt]) => ({ k, pt, d: haversineKm(o.home, pt) })).sort((a, b) => a.d - b.d);
    if (edges[0].d > o.maxTravelKm) return null;
    site = edges[0].pt; siteOffset = edges[0].k; dist = edges[0].d;
  }
  if (bodyTopo(target, date, site).el < o.minElevDeg) return null;
  const atSite = analyzeAt(sat, target, site, bestT, 8, 0.005);
  const atHome = analyzeAt(sat, target, o.home, bestT, 30, 0.02);
  return {
    id: `${target}-${Math.round(bestT / 1000)}`, target, center: atSite.tMin, site,
    siteDistKm: dist, siteBearing: bearingDeg(o.home, site), atSite, atHome, siteOffset, band,
  };
}
