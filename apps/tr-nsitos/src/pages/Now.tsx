import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudRain, Moon, Satellite, Sunrise, Sunset } from 'lucide-react';
import { Skeleton } from '@project/components/ui/skeleton';
import { useApp } from '../context/AppContext';
import { bodyTopo, moonInfo, riseSet } from '../lib/astro';
import { compass } from '../lib/geo';
import { fmtDay, fmtHM, fmtNum, fmtTime } from '../lib/format';
import { weatherAt } from '../lib/weather';
import { passQuality } from '../components/PassDetail';
import PassDetail from '../components/PassDetail';
import type { IssTransit } from '../lib/iss';

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
  </div>
);

export default function Now() {
  const { target, home, weather, iss, settings, loaded } = useApp();
  const [now, setNow] = useState(new Date());
  const [open, setOpen] = useState<IssTransit | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  const b = bodyTopo(target, now, home);
  const day = now.toDateString();
  const rs = useMemo(() => riseSet(target, now, home), [target, home, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const moon = target === 'Lua' ? moonInfo(now) : null;
  const w = weatherAt(weather, now.getTime());
  const next = iss.passes.find((p) => p.target === target && p.center > now.getTime());

  if (!loaded) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{target === 'Sol' ? 'Sol' : 'Lua'} agora</h1>
        <p className="text-sm text-muted-foreground">
          {fmtNum(home.lat, 4)}, {fmtNum(home.lon, 4)} · {fmtTime(now)} · {b.el > 0 ? 'acima do horizonte' : 'abaixo do horizonte'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Altura" value={`${fmtNum(b.el, 1)}°`} sub={b.el < settings.minElevationDegrees ? `Abaixo do mínimo (${settings.minElevationDegrees}°)` : undefined} />
        <Stat label="Azimute" value={`${fmtNum(b.az, 1)}°`} sub={compass(b.az, 16)} />
        <Stat label="Diâmetro aparente" value={`${fmtNum(b.diamDeg, 3)}°`} sub={`${fmtNum(b.diamDeg * 60, 1)}′ · ${fmtNum(b.distKm, 0)} km`} />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Nascer / Pôr</div>
          <div className="mt-1 flex items-center gap-3 font-mono text-xl font-semibold">
            <span className="flex items-center gap-1"><Sunrise className="h-4 w-4 text-primary" />{fmtHM(rs.rise)}</span>
            <span className="flex items-center gap-1"><Sunset className="h-4 w-4 text-primary" />{fmtHM(rs.set)}</span>
          </div>
        </div>
        {moon && (
          <div className="col-span-2 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <MoonIcon illum={moon.illum} waxing={moon.angle < 180} />
            <div><div className="font-semibold">{moon.name}</div><div className="text-sm text-muted-foreground">Iluminação {fmtNum(moon.illum * 100, 0)}%</div></div>
          </div>
        )}
        <div className="col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tempo agora</div>
          {weather ? (
            <div className="mt-2 flex gap-6">
              <span className="flex items-center gap-2"><Cloud className="h-4 w-4" />Nuvens {weather.current.cloud}%</span>
              <span className="flex items-center gap-2"><CloudRain className="h-4 w-4" />Chuva {w?.rainProb ?? 0}% · {fmtNum(weather.current.rain, 1)} mm</span>
            </div>
          ) : <Skeleton className="mt-2 h-5 w-48" />}
        </div>
        <button onClick={() => next && setOpen(next)} className="col-span-2 rounded-xl bg-secondary p-4 text-left transition-colors hover:bg-secondary/80">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Satellite className="h-3.5 w-3.5" />Próxima passagem da ISS</div>
          {iss.status === 'computing' || iss.status === 'loading' ? <div className="mt-1 text-sm text-muted-foreground">A calcular… {Math.round(iss.progress * 100)}%</div>
            : next ? (
              <>
                <div className="mt-1 font-semibold">{fmtDay(next.center)} {fmtTime(next.atSite.entry ?? next.center)} · {fmtNum(next.atSite.duration, 1)} s no disco · {passQuality(next, weatherAt(weather, next.center), settings.maxTravelKm).label}</div>
                <div className="text-sm text-muted-foreground">Local ideal: {fmtNum(next.siteDistKm, 1)} km para {compass(next.siteBearing)}</div>
              </>
            ) : <div className="mt-1 text-sm text-muted-foreground">Sem passagens nos próximos 10 dias até {settings.maxTravelKm} km.</div>}
        </button>
      </div>
      <PassDetail pass={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function MoonIcon({ illum, waxing }: { illum: number; waxing: boolean }) {
  const k = 1 - 2 * illum;
  return (
    <svg viewBox="-1 -1 2 2" className="h-12 w-12">
      <circle r="1" fill="hsl(var(--muted))" />
      <path d={`M0,-1 A1,1 0 0,${waxing ? 1 : 0} 0,1 A${Math.abs(k)},1 0 0,${(k > 0) === waxing ? 0 : 1} 0,-1`} fill="hsl(var(--chart-2))" />
      <Moon className="hidden" />
    </svg>
  );
}
