import { useMemo, useState } from 'react';
import { CalendarPlus, Navigation, Loader2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Progress } from '@project/components/ui/progress';
import { cn } from '@project/components/lib/utils';
import { useApp } from '../context/AppContext';
import { compass } from '../lib/geo';
import { fmtDay, fmtIn, fmtNum, fmtTime, mapsUrl } from '../lib/format';
import { weatherAt } from '../lib/weather';
import PassDetail, { exportPass, passQuality } from '../components/PassDetail';
import type { IssTransit } from '../lib/iss';

type Filter = 'Sol' | 'Lua' | 'Ambos';

export default function Iss() {
  const { iss, weather, settings, target } = useApp();
  const [filter, setFilter] = useState<Filter>(target);
  const [sort, setSort] = useState<'data' | 'melhores'>('data');
  const [open, setOpen] = useState<IssTransit | null>(null);

  const rows = useMemo(() => {
    const list = iss.passes
      .filter((p) => (filter === 'Ambos' || p.target === filter) && p.center > Date.now() - 60_000)
      .map((p) => { const w = weatherAt(weather, p.center); return { p, w, q: passQuality(p, w, settings.maxTravelKm) }; });
    return sort === 'melhores' ? list.sort((a, b) => b.q.score - a.q.score) : list;
  }, [iss.passes, filter, sort, weather, settings.maxTravelKm]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Calendário da ISS</h1>
        <p className="text-sm text-muted-foreground">Próximos 10 dias · até {settings.maxTravelKm} km · altura mínima {settings.minElevationDegrees}°{iss.tleAt ? ` · dados orbitais de ${fmtDay(iss.tleAt)} ${fmtTime(iss.tleAt).slice(0, 5)}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Seg value={sort} onChange={(v) => setSort(v as 'data' | 'melhores')} options={[['data', 'Por data'], ['melhores', 'Melhores']]} />
        <Seg value={filter} onChange={(v) => setFilter(v as Filter)} options={[['Sol', 'Sol'], ['Lua', 'Lua'], ['Ambos', 'Ambos']]} />
      </div>
      {(iss.status === 'computing' || iss.status === 'loading') && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />A calcular as órbitas da ISS…</div>
          <Progress value={iss.progress * 100} />
        </div>
      )}
      {iss.status === 'error' && <div className="rounded-xl border border-destructive p-4 text-sm text-destructive">{iss.error}</div>}
      {iss.status === 'ready' && rows.length === 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <div>
            Nenhuma passagem frente {filter === 'Lua' ? 'à Lua' : filter === 'Sol' ? 'ao Sol' : 'ao Sol ou à Lua'} até {settings.maxTravelKm} km nos próximos 10 dias. Aumente a distância máxima nas Definições para ver mais.
          </div>
          <NearestInfo filter={filter} nearest={iss.nearest} maxTravelKm={settings.maxTravelKm} />
        </div>
      )}
      <div className="space-y-3">
        {rows.map(({ p, w, q }) => (
          <div key={p.id} onClick={() => setOpen(p)} className="grid cursor-pointer grid-cols-2 items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm transition-colors hover:border-primary/60 md:grid-cols-6">
            <div><div className="font-semibold">{fmtDay(p.center)}</div><div className="font-mono text-muted-foreground">{fmtTime(p.atSite.entry ?? p.center)} · {p.target}</div></div>
            <Cell k="No disco" v={`${fmtNum(p.atSite.duration, 2)} s`} />
            <Cell k="Altura · Distância" v={`${fmtNum(p.atSite.bodyEl, 0)}° · ${fmtNum(p.atSite.issRangeKm, 0)} km`} />
            <Cell k="Nuvens · Chuva" v={w ? `${w.cloud}% · ${w.rainProb}%` : '—'} />
            <Cell k={p.siteOffset === 'centro' ? 'Local ideal' : `Local (${p.siteOffset} do centro)`} v={`${fmtNum(p.siteDistKm, 1)} km para ${compass(p.siteBearing)}`} />
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <span className={cn('mr-1 rounded-md px-2 py-1 text-xs font-medium', q.label === 'Excelente' ? 'bg-primary text-primary-foreground' : q.label === 'Boa' ? 'bg-secondary' : 'border border-border text-muted-foreground')}>{q.label}</span>
              <Button size="icon" variant="ghost" title="Calendário" onClick={() => exportPass(p, settings.issAlertMinutes)}><CalendarPlus className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Abrir no mapa" asChild><a href={mapsUrl(p.site.lat, p.site.lon)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /></a></Button>
            </div>
          </div>
        ))}
      </div>
      <PassDetail pass={open} onClose={() => setOpen(null)} />
    </div>
  );
}

const prep = (t: 'Sol' | 'Lua') => (t === 'Sol' ? 'ao Sol' : 'à Lua');

function NearestInfo({ filter, nearest, maxTravelKm }: { filter: Filter; nearest: { Sol: import('../lib/iss').NearestMiss | null; Lua: import('../lib/iss').NearestMiss | null }; maxTravelKm: number }) {
  const candidates = (filter === 'Ambos' ? (['Sol', 'Lua'] as const) : filter === 'Sol' ? (['Sol'] as const) : (['Lua'] as const))
    .map((t) => (nearest[t] ? { target: t, ...nearest[t]! } : null))
    .filter((x): x is { target: 'Sol' | 'Lua'; distKm: number; at: number } => !!x)
    .sort((a, b) => a.distKm - b.distKm);
  const best = candidates[0];
  if (!best) {
    return <div>Nos próximos 10 dias, o Sol e a Lua não chegam a estar acima da altura mínima o suficiente para haver qualquer passagem a considerar.</div>;
  }
  const other = candidates[1];
  return (
    <div>
      O ponto mais próximo onde passaria a ser visível frente {prep(best.target)} fica a{' '}
      <span className="font-medium text-foreground">{fmtNum(best.distKm, 1)} km</span> de casa
      {' '}({fmtNum(best.distKm - maxTravelKm, 1)} km além da sua distância máxima atual), daqui a {fmtIn(best.at - Date.now())}.
      {other && ` Frente ${prep(other.target)}, o ponto mais próximo fica a ${fmtNum(other.distKm, 1)} km.`}
    </div>
  );
}

const Cell = ({ k, v }: { k: string; v: string }) => (
  <div><div className="text-xs text-muted-foreground">{k}</div><div>{v}</div></div>
);

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 text-sm">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cn('rounded px-3 py-1', value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
      ))}
    </div>
  );
}
