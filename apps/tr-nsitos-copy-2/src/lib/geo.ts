export const DEG = Math.PI / 180;
const A = 6378.137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const B = A * (1 - F);

export type Vec = [number, number, number];
export interface LatLon {
  lat: number;
  lon: number;
}

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec) => Math.sqrt(dot(a, a));
export const norm = (a: Vec): Vec => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function geodeticToEcef(lat: number, lon: number, hKm = 0): Vec {
  const p = lat * DEG;
  const l = lon * DEG;
  const N = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
  return [(N + hKm) * Math.cos(p) * Math.cos(l), (N + hKm) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + hKm) * Math.sin(p)];
}

export function ecefToGeodetic(v: Vec): LatLon & { h: number } {
  const [x, y, z] = v;
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - (E2 * N) / (N + h)));
  }
  return { lat: lat / DEG, lon: lon / DEG, h };
}

/** Local East-North-Up vector from observer to target (km). */
export function enuVec(obs: LatLon, obsEcef: Vec, target: Vec): Vec {
  const d = sub(target, obsEcef);
  const p = obs.lat * DEG;
  const l = obs.lon * DEG;
  const e = -Math.sin(l) * d[0] + Math.cos(l) * d[1];
  const n = -Math.sin(p) * Math.cos(l) * d[0] - Math.sin(p) * Math.sin(l) * d[1] + Math.cos(p) * d[2];
  const u = Math.cos(p) * Math.cos(l) * d[0] + Math.cos(p) * Math.sin(l) * d[1] + Math.sin(p) * d[2];
  return [e, n, u];
}

export function azElFromEnu(v: Vec) {
  const range = len(v);
  const el = Math.asin(v[2] / range) / DEG;
  let az = Math.atan2(v[0], v[1]) / DEG;
  if (az < 0) az += 360;
  return { az, el, range };
}

/** Offset (deg) of object direction relative to body centre, in the sky plane: x to the right, y up. */
export function skyOffset(bodyEnu: Vec, objEnu: Vec) {
  const b = norm(bodyEnu);
  const o = norm(objEnu);
  const z: Vec = [0, 0, 1];
  const zb = dot(z, b);
  const up = norm([z[0] - zb * b[0], z[1] - zb * b[1], z[2] - zb * b[2]]);
  const right = cross(b, up);
  const ob = dot(o, b);
  const x = Math.atan2(dot(o, right), ob) / DEG;
  const y = Math.atan2(dot(o, up), ob) / DEG;
  const sep = Math.atan2(len(cross(o, b)), ob) / DEG;
  return { x, y, sep };
}

/** Intersection of a ray with the WGS84 ellipsoid (first hit), or null. */
export function rayEarth(o: Vec, d: Vec): Vec | null {
  const k = A / B;
  const ox = o[0], oy = o[1], oz = o[2] * k;
  const dx = d[0], dy = d[1], dz = d[2] * k;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - A * A;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a);
  if (s < 0) return null;
  return [o[0] + s * d[0], o[1] + s * d[1], o[2] + s * d[2]];
}

/** Distance from point p to segment ab. */
export function segDist(p: Vec, a: Vec, b: Vec) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return len(sub(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]));
}

export function haversineKm(a: LatLon, b: LatLon) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: LatLon, b: LatLon) {
  const p1 = a.lat * DEG, p2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

export function destination(a: LatLon, brgDeg: number, distKm: number): LatLon {
  const R = 6371.0088;
  const d = distKm / R, t = brgDeg * DEG, p1 = a.lat * DEG, l1 = a.lon * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lon: ((l2 / DEG + 540) % 360) - 180 };
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function compass(brg: number, points: 8 | 16 = 8) {
  if (points === 8) return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(brg / 45) % 8];
  return DIRS[Math.round(brg / 22.5) % 16];
}
