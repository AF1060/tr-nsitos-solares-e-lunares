import { bodyTopo, Target } from './astro';
import { DEG, destination, haversineKm, bearingDeg, LatLon } from './geo';
import { lisbonParts } from './sightings';

export interface SRow {
  callsign: string; airline: string; weekday: number; minuteOfDay: number; day: string;
  latitude: number; longitude: number; altitudeM: number; track: number; speed: number;
}

/** semanal = só voos vistos no mesmo dia da semana; diario = todos os voos vistos, em qualquer dia. */
export type Mode = 'semanal' | 'diario';

export const CELL = 2.5; // km
export const RADIUS = 50; // km
const STEP_S = 10;
const SPAN_S = 150;

const LISBON = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function lisbonOffsetMs(ms: number) {
  const p = Object.fromEntries(LISBON.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Instante (ms) da meia-noite de Lisboa do dia de `d`. */
export function lisbonDayStart(d: Date) {
  const p = Object.fromEntries(LISBON.formatToParts(d).map((x) => [x.type, x.value]));
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day);
  return guess - lisbonOffsetMs(guess - lisbonOffsetMs(guess));
}

export const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function fmtMinute(m: number) {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const union = (ps: number[]) => 1 - ps.reduce((acc, p) => acc * (1 - p), 1);

export interface CellFlight { callsign: string; airline: string; p: number; seen: number; cover: number; minutes: number[] }
export interface Cell { lat: number; lon: number; p: number; flights: CellFlight[] }
export interface Analysis { cells: Cell[]; flights: number; start: number; weekday: number }

/**
 * Para cada voo habitual projeta a trajetória e calcula os pontos do chão de onde ele se alinharia com o
 * Sol/Lua. A probabilidade de cada voo operar nesse dia é (dias em que foi visto + 0,5) / (dias em que
 * havia observação a essa hora + 2), para não penalizar voos só porque a app esteve fechada.
 * A probabilidade de uma zona é a de haver pelo menos um voo alinhado: 1 − Π(1 − p).
 */
export function analyse(rows: SRow[], date: Date, home: LatLon, body: Target, minEl: number, mode: Mode): Analysis {
  const start = lisbonDayStart(date);
  const weekday = lisbonParts(new Date(start + 12 * 3600_000)).weekday;
  const use = mode === 'semanal' ? rows.filter((r) => r.weekday === weekday) : rows;

  const cover = new Map<number, Set<string>>();
  for (const r of use) {
    const h = Math.floor(r.minuteOfDay / 60);
    for (const k of [h - 1, h, h + 1]) {
      const hh = (k + 24) % 24;
      let s = cover.get(hh);
      if (!s) { s = new Set(); cover.set(hh, s); }
      s.add(r.day);
    }
  }
  const byFlight = new Map<string, SRow[]>();
  for (const r of use) {
    const a = byFlight.get(r.callsign);
    if (a) a.push(r); else byFlight.set(r.callsign, [r]);
  }

  const kmLat = 111, kmLon = 111 * Math.cos(home.lat * DEG);
  const topo = new Map<number, ReturnType<typeof bodyTopo>>();
  const cells = new Map<string, { ix: number; iy: number; fl: CellFlight[] }>();

  for (const [callsign, fr] of byFlight) {
    const seen = new Set(fr.map((r) => r.day)).size;
    const hour = Math.floor(median(fr.map((r) => r.minuteOfDay)) / 60);
    const cov = Math.max(seen, cover.get(hour)?.size ?? seen);
    const p = Math.min(0.95, (seen + 0.5) / (cov + 2)); // prudente com poucos dias: 1/1 → 50 %, 3/3 → 70 %, 7/7 → 83 %
    const reps = new Map<number, SRow>();
    for (const r of fr) { const b = Math.floor(r.minuteOfDay / 5); if (!reps.has(b)) reps.set(b, r); }

    const hit = new Map<string, number[]>();
    for (const r of reps.values()) {
      const kT = Math.floor(r.minuteOfDay / 3);
      let b = topo.get(kT);
      if (!b) { b = bodyTopo(body, new Date(start + kT * 3 * 60_000), home); topo.set(kT, b); }
      if (b.el < minEl) continue;
      const back = (b.az + 180) % 360;
      const d = r.altitudeM / 1000 / Math.tan(b.el * DEG);
      if (d > 300) continue;
      for (let s = -SPAN_S; s <= SPAN_S; s += STEP_S) {
        const pt = destination({ lat: r.latitude, lon: r.longitude }, r.track, (r.speed * s) / 1000);
        const o = destination(pt, back, d);
        if (haversineKm(home, o) > RADIUS) continue;
        const ix = Math.floor(((o.lon - home.lon) * kmLon) / CELL), iy = Math.floor(((o.lat - home.lat) * kmLat) / CELL);
        const k = `${ix},${iy}`;
        const arr = hit.get(k);
        if (arr) arr.push(r.minuteOfDay + s / 60); else hit.set(k, [r.minuteOfDay + s / 60]);
      }
    }
    for (const [k, minutes] of hit) {
      let c = cells.get(k);
      if (!c) { const [ix, iy] = k.split(',').map(Number); c = { ix, iy, fl: [] }; cells.set(k, c); }
      c.fl.push({ callsign, airline: fr[0].airline, p, seen, cover: cov, minutes });
    }
  }

  const out: Cell[] = [...cells.values()].map((c) => ({
    lat: home.lat + ((c.iy + 0.5) * CELL) / kmLat,
    lon: home.lon + ((c.ix + 0.5) * CELL) / kmLon,
    p: union(c.fl.map((f) => f.p)),
    flights: c.fl,
  })).sort((a, b) => b.p - a.p);
  return { cells: out, flights: byFlight.size, start, weekday };
}

export interface ZoneFlight { callsign: string; airline: string; p: number; seen: number; cover: number; minute: number; el: number }
export interface Zone {
  lat: number; lon: number; radiusKm: number; p: number; distKm: number; bearing: number;
  flights: ZoneFlight[]; hours: number[];
}

/** Melhor zona alcançável (até `reach` km de casa): agrupa as células vizinhas da melhor. */
export function bestZone(a: Analysis, home: LatLon, reach: number, body: Target): Zone | null {
  const reachable = a.cells.filter((c) => haversineKm(home, c) <= reach);
  const best = reachable[0];
  if (!best) return null;
  const near = reachable.filter((c) => haversineKm(c, best) <= 6 && c.p >= best.p * 0.5);
  const w = near.reduce((s, c) => s + c.p, 0) || 1;
  const centre = { lat: near.reduce((s, c) => s + c.lat * c.p, 0) / w, lon: near.reduce((s, c) => s + c.lon * c.p, 0) / w };
  const radiusKm = Math.max(2, ...near.map((c) => haversineKm(centre, c))) + CELL / 2;

  const fm = new Map<string, CellFlight & { all: number[] }>();
  for (const c of near) for (const f of c.flights) {
    const e = fm.get(f.callsign);
    if (e) e.all.push(...f.minutes); else fm.set(f.callsign, { ...f, all: [...f.minutes] });
  }
  const flights: ZoneFlight[] = [...fm.values()].map((f) => {
    const minute = median(f.all);
    return {
      callsign: f.callsign, airline: f.airline, p: f.p, seen: f.seen, cover: f.cover, minute,
      el: bodyTopo(body, new Date(a.start + minute * 60_000), home).el,
    };
  }).sort((x, y) => x.minute - y.minute);
  const hours = Array.from({ length: 24 }, (_, h) => union(flights.filter((f) => Math.floor(((f.minute % 1440) + 1440) % 1440 / 60) === h).map((f) => f.p)));
  return {
    ...centre, radiusKm, p: union(flights.map((f) => f.p)),
    distKm: haversineKm(home, centre), bearing: bearingDeg(home, centre), flights, hours,
  };
}

export interface DayScore { start: number; weekday: number; sol: number; lua: number }

/** Pontuação de um dia: probabilidade da melhor zona alcançável para o Sol e para a Lua. */
export function scoreDay(rows: SRow[], date: Date, home: LatLon, minEl: number, mode: Mode, reach: number): DayScore {
  const out = { start: 0, weekday: 0, sol: 0, lua: 0 };
  for (const t of ['Sol', 'Lua'] as const) {
    const a = analyse(rows, date, home, t, minEl, mode);
    out.start = a.start; out.weekday = a.weekday;
    out[t === 'Sol' ? 'sol' : 'lua'] = bestZone(a, home, reach, t)?.p ?? 0;
  }
  return out;
}

export interface HourProfile {
  /** Nº esperado de voos que alinham em cada hora (0–23), em toda a área alcançável. */
  expected: number[];
  /** Probabilidade de pelo menos um alinhamento em cada hora. */
  prob: number[];
}

/**
 * Perfil horário: para cada voo conta-se uma só vez, na hora mediana em que alinha
 * (dentro de `reach` km de casa), e somam-se as probabilidades de repetição.
 */
export function hourProfile(a: Analysis, home: LatLon, reach: number): HourProfile {
  const fm = new Map<string, { p: number; minutes: number[] }>();
  for (const c of a.cells) {
    if (haversineKm(home, c) > reach) continue;
    for (const f of c.flights) {
      const e = fm.get(f.callsign);
      if (e) e.minutes.push(...f.minutes); else fm.set(f.callsign, { p: f.p, minutes: [...f.minutes] });
    }
  }
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const f of fm.values()) {
    const m = ((Math.round(median(f.minutes)) % 1440) + 1440) % 1440;
    byHour[Math.floor(m / 60)].push(f.p);
  }
  return { expected: byHour.map((ps) => ps.reduce((x, y) => x + y, 0)), prob: byHour.map((ps) => (ps.length ? union(ps) : 0)) };
}
