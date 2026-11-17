import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Navigation } from 'lucide-react';
import { getSightingStats, GetSightingStatsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { DatePicker } from '@project/components/ui/date-picker';
import { cn } from '@project/components/lib/utils';
import { useApp } from '../context/AppContext';
import { bodyTopo } from '../lib/astro';
import { bearingDeg, compass, destination, haversineKm } from '../lib/geo';
import { lisbonParts } from '../lib/sightings';
import { fmtCoord, fmtNum, mapsUrl } from '../lib/format';

type Row = GetSightingStatsOutputType['rows'][0];
const R = 50, CELL = 2.5; // km
const WD = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];

interface Cell { lat: number; lon: number; w: number; hours: Record<number, number>; airlines: Record<string, number> }

function analyse(rows: Row[], day: Date, home: { lat: number; lon: number }, target: 'Sol' | 'Lua', minEl: number) {
  const days = new Set(rows.map((r) => r.day)).size || 1;
  const cells = new Map<string, Cell>();
  const kmLat = 111, kmLon = 111 * Math.cos((home.lat * Math.PI) / 180);
  const base = new Date(day); base.setHours(0, 0, 0, 0);
  for (const r of rows) {
    const t = new Date(base.getTime() + r.minuteOfDay * 60000);
    const b = bodyTopo(target, t, home);
    if (b.el < minEl) continue;
    const back = (b.az + 180) % 360, d = r.altitudeM / 1000 / Math.tan((b.el * Math.PI) / 180);
    if (d > 300) continue;
    const seen = new Set<string>();
    for (let s = -150; s <= 150; s += 10) {
      const p = destination({ lat: r.latitude, lon: r.longitude }, r.track, (r.speed * s) / 1000);
      const o = destination(p, back, d);
      if (haversineKm(home, o) > R) continue;
      const ix = Math.floor(((o.lon - home.lon) * kmLon) / CELL), iy = Math.floor(((o.lat - home.lat) * kmLat) / CELL);
      const k = `${ix},${iy}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const c = cells.get(k) ?? { lat: home.lat + ((iy + 0.5) * CELL) / kmLat, lon: home.lon + ((ix + 0.5) * CELL) / kmLon, w: 0, hours: {}, airlines: {} };
      c.w += 1 / days;
      const h = Math.floor(r.minuteOfDay / 60);
      c.hours[h] = (c.hours[h] ?? 0) + 1;
      c.airlines[r.airline] = (c.airlines[r.airline] ?? 0) + 1;
      cells.set(k, c);
    }
  }
  return { cells: [...cells.values()].sort((a, b) => b.w - a.w), days };
}

export default function Routes() {
  const { home, target, settings } = useApp();
  const [day, setDay] = useState(new Date());
  const [weekly, setWeekly] = useState(false);
  const [data, setData] = useState<GetSightingStatsOutputType | null>(null);
  const [loading, setLoading] = useState(true);
  const wd = lisbonParts(day).weekday;

  useEffect(() => {
    setLoading(true);
    getSightingStats({ minFrom: 0, minTo: 1439, weekday: weekly ? wd : null })
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [weekly, wd]);

  const res = useMemo(() => (data ? analyse(data.rows, day, home, target, settings.minElevationDegrees) : null), [data, day, home, target, settings.minElevationDegrees]);
  const max = res?.cells[0]?.w ?? 1;
  const airlines = useMemo(() => {
    const m = new Map<string, Set<string>>();
    data?.rows.forEach((r) => { const s = m.get(r.airline) ?? new Set(); s.add(`${r.callsign}|${r.day}`); m.set(r.airline, s); });
    const d = res?.days ?? 1;
    return [...m.entries()].map(([a, s]) => ({ a, perDay: s.size / d })).sort((x, y) => y.perDay - x.perDay).slice(0, 8);
  }, [data, res]);
  const per = weekly ? `por ${WD[wd].slice(0, -1)}` : 'por dia';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><BarChart3 className="h-6 w-6 text-primary" />Rotas · zonas prováveis</h1>
        <p className="text-sm text-muted-foreground">Onde os aviões habituais passam mais vezes frente {target === 'Sol' ? 'ao Sol' : 'à Lua'}, a partir das observações guardadas</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56"><DatePicker value={day} onChange={(d) => d && setDay(d)} /></div>
        <div className="flex rounded-full border border-border p-0.5 text-sm">
          {[[false, 'Todos os dias'], [true, `Só às ${WD[wd]}`]].map(([k, l]) => (
            <button key={String(k)} onClick={() => setWeekly(k as boolean)} className={cn('rounded-full px-3 py-1', weekly === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l as string}</button>
          ))}
        </div>
      </div>

      {data && (
        <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {data.totalSightings} observações em {data.daysObserved} dias{data.firstDay ? ` desde ${data.firstDay}` : ''}. Os dados são recolhidos enquanto o separador Aviões está aberto: quanto mais tempo o deixar aberto, a horas diferentes, melhor a estatística.
          {data.daysObserved < 7 && ' Ainda há poucos dias de dados: os resultados são indicativos.'}
        </div>
      )}

      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A calcular…</div> : !res || res.cells.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Ainda não há dados suficientes para este dia/alvo. Abra o separador Aviões durante as horas em que {target === 'Sol' ? 'o Sol' : 'a Lua'} está alto para começar a recolher.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3 lg:col-span-2">
            <HeatMap cells={res.cells} max={max} home={home} />
            <div className="mt-2 text-xs text-muted-foreground">Cada quadrado tem {CELL} km. Cor mais forte = mais cruzamentos esperados {per}. ✚ = você · anéis de 10 km.</div>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">Melhores zonas</div>
            {res.cells.slice(0, 5).map((c, i) => {
              const hrs = Object.entries(c.hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h.padStart(2, '0')}h`).join(', ');
              const al = Object.entries(c.airlines).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a).join(', ');
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{fmtNum(haversineKm(home, c), 1)} km para {compass(bearingDeg(home, c))}</span>
                    <Button size="sm" variant="outline" asChild><a href={mapsUrl(c.lat, c.lon)} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5" />Mapa</a></Button>
                  </div>
                  <div className="text-xs text-muted-foreground">{fmtCoord(c.lat, c.lon)}</div>
                  <div className="mt-1 text-xs">≈ {fmtNum(c.w, 1)} cruzamentos {per} · melhores horas {hrs}</div>
                  <div className="text-xs text-muted-foreground">Companhias: {al}</div>
                </div>
              );
            })}
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="mb-1 font-medium">Companhias mais frequentes ({per})</div>
              {airlines.map((x) => <div key={x.a} className="flex justify-between text-xs"><span>{x.a}</span><span className="tabular-nums">{fmtNum(x.perDay, 1)} voos</span></div>)}
            </div>
            <p className="text-xs text-muted-foreground">Assume que os voos repetem os mesmos horários e rotas. A posição {target === 'Sol' ? 'do Sol' : 'da Lua'} é a do dia escolhido, por isso as zonas mudam ao longo do ano.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function HeatMap({ cells, max, home }: { cells: Cell[]; max: number; home: { lat: number; lon: number } }) {
  const kmLon = 111 * Math.cos((home.lat * Math.PI) / 180);
  const s = 100 / R;
  return (
    <svg viewBox="-108 -108 216 216" className="mx-auto aspect-square max-h-[520px] w-full">
      <circle r={100} fill="hsl(var(--muted))" fillOpacity={0.4} />
      {cells.map((c, i) => {
        const x = (c.lon - home.lon) * kmLon * s, y = -(c.lat - home.lat) * 111 * s;
        return <rect key={i} x={x - (CELL * s) / 2} y={y - (CELL * s) / 2} width={CELL * s} height={CELL * s} fill="hsl(var(--primary))" fillOpacity={0.1 + 0.85 * (c.w / max)} />;
      })}
      {[10, 20, 30, 40, 50].map((r) => <circle key={r} r={r * s} fill="none" stroke="hsl(var(--border))" strokeWidth={0.4} />)}
      {['N', 'E', 'S', 'O'].map((d, i) => { const a = (i * 90 * Math.PI) / 180; return <text key={d} x={Math.sin(a) * 105} y={-Math.cos(a) * 105 + 2} fontSize={5} textAnchor="middle" fill="hsl(var(--muted-foreground))">{d}</text>; })}
      <line x1={-3} x2={3} y1={0} y2={0} stroke="hsl(var(--foreground))" strokeWidth={0.8} />
      <line x1={0} x2={0} y1={-3} y2={3} stroke="hsl(var(--foreground))" strokeWidth={0.8} />
    </svg>
  );
}
