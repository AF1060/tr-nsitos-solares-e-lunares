const nf = (d: number) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtNum = (n: number, d = 0) => nf(d).format(n);

export function fmtTime(t: number | Date | null, tenths = false) {
  if (t === null) return '—';
  const d = new Date(t);
  const s = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return tenths ? `${s},${Math.floor((d.getMilliseconds() / 100) % 10)}` : s;
}

export const fmtHM = (t: number | Date | null) =>
  t === null ? '—' : new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

export function fmtDay(t: number | Date) {
  const s = new Date(t).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\./g, '');
}

export function fmtCountdown(ms: number) {
  const neg = ms < 0;
  const s = Math.abs(Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${neg ? '+' : ''}${p(h)}:${p(m)}:${p(sec)}`;
}

export function fmtIn(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `em ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `em ${m} min ${s % 60} s`;
  return `em ${Math.floor(m / 60)} h ${m % 60} min`;
}

export const fmtCoord = (lat: number, lon: number) =>
  `${fmtNum(Math.abs(lat), 4)} ${lat >= 0 ? 'N' : 'S'} · ${fmtNum(Math.abs(lon), 4)} ${lon >= 0 ? 'E' : 'O'}`;

export const mapsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;
