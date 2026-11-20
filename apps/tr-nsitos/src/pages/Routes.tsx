import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Navigation, Sun, Moon } from 'lucide-react';
import { getSightingStats, GetSightingStatsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { DatePicker } from '@project/components/ui/date-picker';
import { cn } from '@project/components/lib/utils';
import { useApp } from '../context/AppContext';
import type { Target } from '../lib/astro';
import { compass } from '../lib/geo';
import { fmtCoord, fmtNum, mapsUrl } from '../lib/format';
import { analyse, bestZone, scoreDay, hourProfile, lisbonDayStart, fmtMinute, CELL, RADIUS, WEEKDAYS_SHORT, Mode, Cell, Zone, DayScore, HourProfile } from '../lib/routeStats';

const pct = (p: number) => `${fmtNum(p * 100, 0)} %`;
const DAY_MS = 86_400_000;

export default function Routes() {
  const { home, target, settings } = useApp();
  const [body, setBody] = useState<Target>(target);
  const [day, setDay] = useState(new Date());
  const [mode, setMode] = useState<Mode>('semanal');
  const [data, setData] = useState<GetSightingStatsOutputType | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastLoad, setLastLoad] = useState<number | null>(null);
  const [now2, setNow2] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow2(Date.now()), 10_000); return () => clearInterval(id); }, []);
  const [cal, setCal] = useState<DayScore[]>([]);
  const reach = settings.maxTravelKm, minEl = settings.minElevationDegrees;

  useEffect(() => setBody(target), [target]);
  // O coletor em segundo plano acrescenta observações constantemente (2x/minuto), por isso esta página
  // teria de ser fechada e reaberta para ver dados novos se só buscasse uma vez. Atualiza-se sozinha a
  // cada minuto, o que também é o que faz o mapa de densidades e as restantes estatísticas mudarem com o
  // tempo em vez de ficarem presas aos dados do primeiro carregamento.
  useEffect(() => {
    let alive = true;
    const load = () => getSightingStats({ minFrom: 0, minTo: 1439, weekday: null }).then((d) => alive && setData(d)).catch(() => alive && setData(null)).finally(() => { if (alive) { setLoading(false); setLastLoad(Date.now()); } });
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const analysis = useMemo(() => (data ? analyse(data.rows, day, home, body, minEl, mode) : null), [data, day, home, body, minEl, mode]);
  const zone = useMemo(() => (analysis ? bestZone(analysis, home, reach, body) : null), [analysis, home, reach, body]);

  // Calendário dos próximos 30 dias, calculado aos poucos para não bloquear a página.
  useEffect(() => {
    if (!data) return;
    let stop = false;
    setCal([]);
    (async () => {
      const t0 = lisbonDayStart(new Date());
      const out: DayScore[] = [];
      for (let i = 0; i < 30 && !stop; i++) {
        await new Promise((r) => setTimeout(r, 0));
        out.push(scoreDay(data.rows, new Date(t0 + i * DAY_MS + 12 * 3600_000), home, minEl, mode, reach));
        if (!stop) setCal([...out]);
      }
    })();
    return () => { stop = true; };
  }, [data, home, minEl, mode, reach]);

  // Horas com mais cruzamentos (toda a área alcançável) no dia escolhido, para o Sol e para a Lua.
  const profiles = useMemo(() => {
    if (!data) return null;
    return {
      Sol: hourProfile(analyse(data.rows, day, home, 'Sol', minEl, mode), home, reach),
      Lua: hourProfile(analyse(data.rows, day, home, 'Lua', minEl, mode), home, reach),
    } as Record<Target, HourProfile>;
  }, [data, day, home, minEl, mode, reach]);

  // Grelha dia da semana × hora para o alvo escolhido (próximos 7 dias).
  const [week, setWeek] = useState<{ start: number; weekday: number; prob: number[]; expected: number[] }[]>([]);
  useEffect(() => {
    if (!data) return;
    let stop = false;
    setWeek([]);
    (async () => {
      const t0 = lisbonDayStart(new Date());
      const out: typeof week = [];
      for (let i = 0; i < 7 && !stop; i++) {
        await new Promise((r) => setTimeout(r, 0));
        const a = analyse(data.rows, new Date(t0 + i * DAY_MS + 12 * 3600_000), home, body, minEl, mode);
        const h = hourProfile(a, home, reach);
        out.push({ start: a.start, weekday: a.weekday, prob: h.prob, expected: h.expected });
        if (!stop) setWeek([...out]);
      }
    })();
    return () => { stop = true; };
  }, [data, home, body, minEl, mode, reach]);

  const weekMax = Math.max(0.01, ...week.flatMap((d) => d.expected));
  const key = body === 'Sol' ? 'sol' : 'lua';
  const best = useMemo(() => [...cal].sort((a, b) => b[key] - a[key]).filter((d) => d[key] > 0).slice(0, 3), [cal, key]);
  const name = body === 'Sol' ? 'o Sol' : 'a Lua';
  const selStart = lisbonDayStart(day);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><BarChart3 className="h-6 w-6 text-primary" />Rotas · zonas prováveis</h1>
        <p className="text-sm text-muted-foreground">Onde e a que horas os voos habituais mais provavelmente se alinham com {name}, assumindo que mantêm a frequência semanal.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56"><DatePicker value={day} onChange={(d) => d && setDay(d)} /></div>
        <div className="flex rounded-full border border-border p-0.5 text-sm">
          {(['Sol', 'Lua'] as const).map((t) => (
            <button key={t} onClick={() => setBody(t)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1', body === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {t === 'Sol' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}{t}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-border p-0.5 text-sm">
          {([['semanal', 'Semanal'], ['diario', 'Qualquer dia']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cn('rounded-full px-3 py-1', mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
      </div>

      {data && (
        <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {data.totalSightings} observações em {data.daysObserved} dia(s){data.firstDay ? ` desde ${data.firstDay}` : ''}.
          {mode === 'semanal' ? ' Modo semanal: só contam os voos vistos no mesmo dia da semana da data escolhida.' : ' Modo "qualquer dia": contam todos os voos vistos, em qualquer dia.'}
          {' '}Os dados só são recolhidos enquanto o separador Aviões está aberto; quantas mais semanas e horas diferentes, mais fiável.
          {data.daysObserved < 14 && ' Ainda há poucos dias de dados: as probabilidades são indicativas.'}
          {data.truncated && ' Atenção: só foram usadas as 10 000 observações mais recentes.'}
          {lastLoad && ` · atualizado há ${Math.max(0, Math.round((now2 - lastLoad) / 1000))} s (atualiza-se sozinho a cada minuto)`}
        </div>
      )}

      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A calcular…</div> : (
        <>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-medium">Próximos 30 dias · melhor zona alcançável ({settings.maxTravelKm} km)</div>
              {best.length > 0 && <div className="text-xs text-muted-foreground">Melhores dias para {name}: {best.map((d) => `${new Date(d.start).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' })} (${WEEKDAYS_SHORT[d.weekday]}, ${pct(d[key])})`).join(' · ')}</div>}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {cal.map((d) => {
                const dt = new Date(d.start);
                const sel = d.start === selStart;
                return (
                  <button key={d.start} onClick={() => setDay(new Date(d.start + 12 * 3600_000))} className={cn('flex w-12 shrink-0 flex-col items-center rounded-md border p-1 text-[10px]', sel ? 'border-primary bg-primary/10' : 'border-border')}>
                    <span className="text-muted-foreground">{WEEKDAYS_SHORT[d.weekday]}</span>
                    <span className="font-medium">{dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Lisbon' })}</span>
                    <div className="mt-1 flex h-10 items-end gap-0.5">
                      <div className="w-2 rounded-sm bg-amber-400" style={{ height: `${Math.max(2, d.sol * 100)}%`, opacity: body === 'Sol' ? 1 : 0.35 }} title={`Sol ${pct(d.sol)}`} />
                      <div className="w-2 rounded-sm bg-sky-300" style={{ height: `${Math.max(2, d.lua * 100)}%`, opacity: body === 'Lua' ? 1 : 0.35 }} title={`Lua ${pct(d.lua)}`} />
                    </div>
                    <span className="tabular-nums">{pct(d[key])}</span>
                  </button>
                );
              })}
              {cal.length < 30 && <div className="flex items-center px-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground"><span className="text-amber-400">■</span> Sol · <span className="text-sky-300">■</span> Lua. Altura da barra = probabilidade de pelo menos um voo regular se alinhar na melhor zona.</div>
          </div>

          {profiles && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 text-sm font-medium">Horas com mais cruzamentos · {day.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' })} (toda a área até {reach} km)</div>
              <div className="grid gap-4 md:grid-cols-2">
                {(['Sol', 'Lua'] as const).map((t) => <HourBars key={t} t={t} prof={profiles[t]} />)}
              </div>
              <div className="mt-3 text-sm font-medium">Próximos 7 dias · {body} · voos esperados por hora</div>
              <div className="mt-1 overflow-x-auto">
                <div className="min-w-[560px] space-y-0.5">
                  <div className="flex pl-14 text-[9px] text-muted-foreground">{Array.from({ length: 24 }, (_, h) => <div key={h} className="flex-1 text-center">{h % 2 === 0 ? String(h).padStart(2, '0') : ''}</div>)}</div>
                  {week.map((d) => (
                    <div key={d.start} className="flex items-center">
                      <div className="w-14 shrink-0 text-[10px] text-muted-foreground">{WEEKDAYS_SHORT[d.weekday]} {new Date(d.start).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Lisbon' })}</div>
                      {d.prob.map((p, h) => (
                        <div key={h} className="mx-px h-5 flex-1 rounded-sm bg-primary" style={{ opacity: d.expected[h] > 0 ? 0.15 + 0.85 * (d.expected[h] / weekMax) : 0.04 }} title={`${String(h).padStart(2, '0')}h · ~${fmtNum(d.expected[h], 1)} voo(s) · ${pct(p)}`} />
                      ))}
                    </div>
                  ))}
                  {week.length < 7 && <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">Só há valores nas horas em que {name} está acima da altura mínima e já houve observações nessa hora e dia da semana. Mais dias de dados dão perfis mais fiáveis.</div>
            </div>
          )}

          {!analysis || !zone ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Ainda não há dados suficientes para este dia/alvo dentro do alcance de {reach} km. Abra o separador Aviões durante as horas em que {name} está alto para começar a recolher{mode === 'semanal' ? ', ou experimente "Qualquer dia"' : ''}.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3 lg:col-span-2">
                <HeatMap cells={analysis.cells} zone={zone} home={home} reach={reach} />
                <div className="mt-2 text-xs text-muted-foreground">Quadrados de {CELL} km: cor mais forte = maior probabilidade. Círculo a cheio = zona recomendada · tracejado = alcance máximo · ✚ = você · anéis de 10 km.</div>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/50 bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Zona recomendada</span>
                    <Button size="sm" variant="outline" asChild><a href={mapsUrl(zone.lat, zone.lon)} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5" />Mapa</a></Button>
                  </div>
                  <div className="mt-1">{fmtNum(zone.distKm, 1)} km para {compass(zone.bearing)} · raio ≈ {fmtNum(zone.radiusKm, 1)} km</div>
                  <div className="text-xs text-muted-foreground">{fmtCoord(zone.lat, zone.lon)}</div>
                  <div className="mt-2 text-2xl font-semibold text-primary">{pct(zone.p)}</div>
                  <div className="text-xs text-muted-foreground">probabilidade de pelo menos um alinhamento com {name} nesse dia</div>
                </div>

                <HourChart zone={zone} />

                <div className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="mb-1 font-medium">Voos que alinham nesta zona</div>
                  {zone.flights.slice(0, 10).map((f) => (
                    <div key={f.callsign} className="flex justify-between gap-2 text-xs">
                      <span><span className="font-medium tabular-nums">{fmtMinute(f.minute)}</span> · {f.callsign} <span className="text-muted-foreground">({f.airline})</span></span>
                      <span className="text-right text-muted-foreground">visto {f.seen}/{f.cover} · {pct(f.p)} · {fmtNum(f.el, 0)}°</span>
                    </div>
                  ))}
                  <div className="mt-1 text-[11px] text-muted-foreground">"visto 2/3" = presente em 2 dos 3 dias com observação a essa hora; % = probabilidade de repetir; ° = altura {body === 'Sol' ? 'do Sol' : 'da Lua'}.</div>
                </div>
                <p className="text-xs text-muted-foreground">A zona indica onde o alinhamento é provável, não a posição exata: o trânsito real depende da rota do dia, por isso confirme no separador Aviões (previsão em tempo real com margem de erro). Horas de Lisboa.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HourBars({ t, prof }: { t: Target; prof: HourProfile }) {
  const top = prof.prob.map((p, h) => ({ p, h, e: prof.expected[h] })).filter((x) => x.e > 0).sort((a, b) => b.e - a.e).slice(0, 3);
  const max = Math.max(...prof.expected, 0.01);
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-sm">{t === 'Sol' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-sky-300" />}<span className="font-medium">{t}</span></div>
      {top.length === 0 ? <div className="text-xs text-muted-foreground">Sem alinhamentos prováveis neste dia (ou sem dados nessas horas).</div> : (
        <>
          <div className="flex h-20 items-end gap-px">
            {prof.expected.map((e, h) => (
              <div key={h} className="flex flex-1 flex-col items-center justify-end" title={`${String(h).padStart(2, '0')}h · ~${fmtNum(e, 1)} voo(s) · ${pct(prof.prob[h])}`}>
                <div className={cn('w-full rounded-sm', t === 'Sol' ? 'bg-amber-400' : 'bg-sky-300')} style={{ height: `${e > 0 ? Math.max(6, (e / max) * 100) : 1}%`, opacity: e > 0 ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
          <div className="flex text-[9px] text-muted-foreground">{Array.from({ length: 24 }, (_, h) => <div key={h} className="flex-1 text-center">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>)}</div>
          <div className="mt-1 text-xs">Horas com mais cruzamentos: {top.map((x) => `${String(x.h).padStart(2, '0')}h (~${fmtNum(x.e, 1)} voo${x.e >= 1.5 ? 's' : ''}, ${pct(x.p)})`).join(' · ')}</div>
        </>
      )}
    </div>
  );
}

function HourChart({ zone }: { zone: Zone }) {
  const hrs = zone.hours.map((p, h) => ({ p, h })).filter((x) => x.p > 0);
  if (!hrs.length) return null;
  const from = Math.max(0, Math.min(...hrs.map((x) => x.h)) - 1), to = Math.min(23, Math.max(...hrs.map((x) => x.h)) + 1);
  const cols = zone.hours.slice(from, to + 1);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="mb-2 font-medium">Melhores horas</div>
      <div className="flex h-20 items-end gap-1">
        {cols.map((p, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${String(from + i).padStart(2, '0')}h · ${pct(p)}`}>
            <div className="w-full rounded-sm bg-primary" style={{ height: `${Math.max(p > 0 ? 6 : 1, p * 100)}%`, opacity: p > 0 ? 1 : 0.2 }} />
            <span className="text-[9px] text-muted-foreground">{String(from + i).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatMap({ cells, zone, home, reach }: { cells: Cell[]; zone: Zone; home: { lat: number; lon: number }; reach: number }) {
  const kmLon = 111 * Math.cos((home.lat * Math.PI) / 180);
  const s = 100 / RADIUS;
  const max = cells[0]?.p || 1;
  const zx = (zone.lon - home.lon) * kmLon * s, zy = -(zone.lat - home.lat) * 111 * s;
  return (
    <svg viewBox="-108 -108 216 216" className="mx-auto aspect-square max-h-[520px] w-full">
      <circle r={100} fill="hsl(var(--muted))" fillOpacity={0.4} />
      {cells.map((c, i) => {
        const x = (c.lon - home.lon) * kmLon * s, y = -(c.lat - home.lat) * 111 * s;
        return <rect key={i} x={x - (CELL * s) / 2} y={y - (CELL * s) / 2} width={CELL * s} height={CELL * s} fill="hsl(var(--primary))" fillOpacity={0.1 + 0.85 * (c.p / max)} />;
      })}
      {[10, 20, 30, 40, 50].map((r) => <circle key={r} r={r * s} fill="none" stroke="hsl(var(--border))" strokeWidth={0.4} />)}
      <circle r={Math.min(reach, RADIUS) * s} fill="none" stroke="hsl(var(--foreground))" strokeWidth={0.6} strokeDasharray="3 2" />
      <circle cx={zx} cy={zy} r={zone.radiusKm * s} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      {['N', 'E', 'S', 'O'].map((d, i) => { const a = (i * 90 * Math.PI) / 180; return <text key={d} x={Math.sin(a) * 105} y={-Math.cos(a) * 105 + 2} fontSize={5} textAnchor="middle" fill="hsl(var(--muted-foreground))">{d}</text>; })}
      <line x1={-3} x2={3} y1={0} y2={0} stroke="hsl(var(--foreground))" strokeWidth={0.8} />
      <line x1={0} x2={0} y1={-3} y2={3} stroke="hsl(var(--foreground))" strokeWidth={0.8} />
    </svg>
  );
}
