import { DEG, LatLon } from './geo';
import { bodyTopo, moonInfo } from './astro';

// Galáctico (J2000) -> equatorial
const RA_P = 192.85948 * DEG, DEC_P = 27.12825 * DEG, L_NCP = 122.93192 * DEG;

export function galToEq(l: number, b: number) {
  const lr = l * DEG, br = b * DEG;
  const sd = Math.sin(br) * Math.sin(DEC_P) + Math.cos(br) * Math.cos(DEC_P) * Math.cos(L_NCP - lr);
  const dec = Math.asin(sd);
  const y = Math.cos(br) * Math.sin(L_NCP - lr);
  const x = Math.sin(br) * Math.cos(DEC_P) - Math.cos(br) * Math.sin(DEC_P) * Math.cos(L_NCP - lr);
  return { ra: RA_P + Math.atan2(y, x), dec };
}

function lst(date: Date, lon: number) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const gmst = 280.46061837 + 360.98564736629 * d;
  return (((gmst + lon) % 360) + 360) % 360 * DEG;
}

export function eqToHor(ra: number, dec: number, date: Date, obs: LatLon) {
  const H = lst(date, obs.lon) - ra, phi = obs.lat * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
  return { alt: alt / DEG, az: ((az / DEG) + 360) % 360 };
}

export const galHor = (l: number, b: number, date: Date, obs: LatLon) => { const e = galToEq(l, b); return eqToHor(e.ra, e.dec, date, obs); };

// Amostras da faixa: mais larga e brilhante junto ao núcleo
export interface BandPt { l: number; b: number; w: number }
export const BAND: BandPt[] = (() => {
  const pts: BandPt[] = [];
  for (let l = 0; l < 360; l += 3) {
    const dl = Math.min(l, 360 - l);
    const half = dl < 30 ? 14 : dl < 90 ? 10 : 7;
    const bright = dl < 30 ? 1 : dl < 90 ? 0.7 : 0.4;
    for (let b = -half; b <= half; b += 3.5) pts.push({ l, b, w: bright * (1 - Math.abs(b) / (half + 4)) });
  }
  return pts;
})();

export function skyState(date: Date, obs: LatLon) {
  const gc = galHor(0, 0, date, obs);
  const above = BAND.filter((p) => galHor(p.l, p.b, date, obs).alt > 0).length;
  const sun = bodyTopo('Sol', date, obs).el;
  const moon = bodyTopo('Lua', date, obs).el;
  return { gc, fracAbove: above / BAND.length, sun, moon, moonIllum: moonInfo(date).illum };
}

export const darkness = (sunEl: number) =>
  sunEl < -18 ? 'Noite astronómica' : sunEl < -12 ? 'Crepúsculo astronómico' : sunEl < -6 ? 'Crepúsculo náutico' : sunEl < 0 ? 'Crepúsculo civil' : 'Dia';

// Janela da noite (do dia escolhido às 12:00 até ao dia seguinte às 12:00)
export function nightWindow(day: Date, obs: LatLon, minEl: number) {
  const start = new Date(day); start.setHours(12, 0, 0, 0);
  let darkFrom: number | null = null, darkTo: number | null = null, gcFrom: number | null = null, gcTo: number | null = null;
  let best = { t: 0, alt: -90, az: 0 };
  for (let m = 0; m <= 24 * 60; m += 5) {
    const t = new Date(start.getTime() + m * 60000);
    const sun = bodyTopo('Sol', t, obs).el;
    if (sun < -18) { darkFrom ??= t.getTime(); darkTo = t.getTime(); }
    const gc = galHor(0, 0, t, obs);
    if (sun < -18 && gc.alt > minEl) {
      gcFrom ??= t.getTime(); gcTo = t.getTime();
      if (gc.alt > best.alt) best = { t: t.getTime(), alt: gc.alt, az: gc.az };
    }
  }
  return { start: start.getTime(), darkFrom, darkTo, gcFrom, gcTo, best: gcFrom ? best : null };
}
