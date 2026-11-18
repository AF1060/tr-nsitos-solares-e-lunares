import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pause, Play } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { useApp } from '../context/AppContext';
import { useAircraft, RADAR_KM } from '../context/AircraftContext';
import { planeAt, planePolar, planeTrack, PlanePrediction } from '../lib/aircraft';
import { compass } from '../lib/geo';
import { Navigation } from 'lucide-react';
import { bodyTopo, fieldOfView } from '../lib/astro';
import { fmtCoord, fmtIn, fmtNum, fmtTime, mapsUrl } from '../lib/format';
import DiscDiagram from '../components/DiscDiagram';

export default function Aircraft() {
  const { settings, target } = useApp();
  const discName = target === 'Sol' ? 'ao disco solar' : 'ao disco lunar';
  const { watching, setWatching, predictions, lastUpdate, error, source, planes } = useAircraft();
  const [open, setOpen] = useState<PlanePrediction | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setWatching(true); }, [setWatching]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Aviões · {RADAR_KM} km</h1>
          <p className="text-sm text-muted-foreground">
            {lastUpdate ? `Atualizado há ${Math.round((now - lastUpdate) / 1000)} s · ${planes.length} aviões` : watching ? 'A obter dados…' : 'Vigia em pausa'}
            {source ? ` · fonte: ${source}` : ''}
          </p>
        </div>
        <Button variant="outline" onClick={() => setWatching(!watching)}>{watching ? <><Pause className="mr-2 h-4 w-4" />Pausar vigia</> : <><Play className="mr-2 h-4 w-4" />Vigiar</>}</Button>
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/60 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />{error}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 lg:col-span-2">
          <RadarView predictions={predictions} />
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>✚ Você (centro do radar)</span>
            <span><span className="text-primary">●</span> {target}, na direção onde está no céu</span>
            <span>• Avião, com traço a indicar o rumo</span>
            <span><span className="text-primary">●</span> Avião que vai cruzar o disco (com rota prevista)</span>
            <span><span style={{ color: 'hsl(var(--chart-4))' }}>◆</span> Local onde o avião passa no centro do disco</span>
            <span>Círculo tracejado: distância máxima que se desloca ({settings.maxTravelKm} km)</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-sm font-medium">Vão passar frente {discName} (próx. 10 min, visto daqui ou de um local até {settings.maxTravelKm} km)</div>
          {predictions.length === 0 && <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum avião previsto para passar frente {discName} ou à orla.</div>}
          {predictions.map((p) => (
            <button key={p.plane.icao24} onClick={() => setOpen(p)} className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60">
              <div className="flex justify-between"><span className="font-semibold">{p.plane.callsign}</span><span className="text-sm tabular-nums">{fmtIn((p.entry ?? p.closest) - now)}</span></div>
              <div className="text-xs text-muted-foreground">{fmtNum(p.plane.altM, 0)} m · {fmtNum(p.rangeKm, 0)} km · ± {fmtNum(p.errDeg, 2)}° / ± {fmtNum(p.errS, 0)} s</div>
              <div className={cn('mt-1 text-xs', p.confidence === 'baixa' ? 'text-muted-foreground' : 'text-primary')}>
                {p.entry ? `No seu local: passa a ${fmtNum(p.minSep, 2)}° do centro · ${fmtNum(p.inDiscS, 1)} s no disco · confiança ${p.confidence}` : `No seu local não passa frente ${discName}; só num dos locais abaixo`}
              </div>
              {p.alternatives[0] && (
                <div className="mt-1 text-xs">Centro do disco: {fmtNum(p.alternatives[0].distKm, 1)} km para {compass(p.alternatives[0].brg)} às {fmtTime(p.alternatives[0].t)}{p.alternatives.length > 1 ? ` · +${p.alternatives.length - 1} locais` : ''}{p.alternatives[0].band ? ` · faixa de ± ${fmtNum(p.alternatives[0].band.halfWidthM, 0)} m` : ''}</div>
              )}
            </button>
          ))}
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Previsão por extrapolação da rota atual (rumo, velocidade e razão de subida). A incerteza cresce com o tempo e com mudanças de rumo.</div>
        </div>
      </div>
      <PlaneDetail p={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function RadarView({ predictions }: { predictions: PlanePrediction[] }) {
  const { home, target } = useApp();
  const { planes } = useAircraft();
  const { settings } = useApp();
  const body = bodyTopo(target, new Date(), home);
  const hot = new Set(predictions.map((p) => p.plane.icao24));
  const xy = (dist: number, brg: number) => [(dist / RADAR_KM) * Math.sin((brg * Math.PI) / 180) * 100, -(dist / RADAR_KM) * Math.cos((brg * Math.PI) / 180) * 100];
  const [bx, by] = xy(RADAR_KM, body.az);
  return (
    <svg viewBox="-110 -110 220 220" className="mx-auto aspect-square max-h-[520px] w-full">
      {[20, 40, 60, 80].map((r) => <circle key={r} r={(r / RADAR_KM) * 100} fill="none" stroke="hsl(var(--border))" strokeWidth={0.4} />)}
      {[20, 40, 60, 80].map((r) => <text key={r} x={1.5} y={-(r / RADAR_KM) * 100 + 4} fontSize={3.5} fill="hsl(var(--muted-foreground))">{r} km</text>)}
      {['N', 'E', 'S', 'O'].map((d, i) => { const [x, y] = xy(RADAR_KM * 1.07, i * 90); return <text key={d} x={x} y={y + 1.5} fontSize={5} textAnchor="middle" fill="hsl(var(--muted-foreground))">{d}</text>; })}
      {body.el > 0 && <line x1={0} y1={0} x2={bx} y2={by} stroke="hsl(var(--primary))" strokeWidth={0.8} strokeDasharray="2 1.5" />}
      {body.el > 0 && (
        <g>
          <circle cx={bx} cy={by} r={7} fill="hsl(var(--primary))" fillOpacity={0.25} />
          <circle cx={bx} cy={by} r={4.5} fill={target === 'Lua' ? 'hsl(var(--foreground))' : 'hsl(var(--primary))'} stroke="hsl(var(--primary))" strokeWidth={0.8} />
          <text x={bx} y={by + (by > 0 ? -9 : 12)} fontSize={4} textAnchor="middle" fill="hsl(var(--primary))">{target} · {body.el.toFixed(0)}° alt.</text>
        </g>
      )}
      {body.el <= 0 && <text x={0} y={-104} fontSize={4} textAnchor="middle" fill="hsl(var(--muted-foreground))">{target} abaixo do horizonte</text>}
      <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke="hsl(var(--foreground))" strokeWidth={0.7} />
      <line x1={0} y1={-3.5} x2={0} y2={3.5} stroke="hsl(var(--foreground))" strokeWidth={0.7} />
      <text x={3} y={6} fontSize={3.5} fill="hsl(var(--foreground))">Você</text>
      <circle r={(settings.maxTravelKm / RADAR_KM) * 100} fill="hsl(var(--primary))" fillOpacity={0.05} stroke="hsl(var(--primary))" strokeOpacity={0.4} strokeWidth={0.4} strokeDasharray="1.5 1.5" />
      {predictions.map((pr) => {
        const pts = [] as string[];
        const tEnd = Math.max(pr.closest, pr.alternatives.reduce((m, a) => Math.max(m, a.t), 0)) + 30_000;
        for (let t = Date.now(); t <= tEnd; t += 5000) {
          const pos = planeAt(pr.plane, t);
          const { dist, brg } = planePolar({ ...pr.plane, lat: pos.lat, lon: pos.lon }, home);
          if (dist > RADAR_KM * 1.05) break;
          const [x, y] = xy(dist, brg);
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return (
          <g key={`path-${pr.plane.icao24}`}>
            <polyline points={pts.join(' ')} fill="none" stroke="hsl(var(--primary))" strokeWidth={0.7} strokeDasharray="2 1.5" />
            {pr.alternatives.map((a, i) => {
              const [x, y] = xy(a.distKm, a.brg);
              return <rect key={i} x={x - 1.6} y={y - 1.6} width={3.2} height={3.2} transform={`rotate(45 ${x} ${y})`} fill="hsl(var(--chart-4))" />;
            })}
          </g>
        );
      })}
      {planes.map((p) => {
        const { dist, brg } = planePolar(p, home);
        if (dist > RADAR_KM) return null;
        const [x, y] = xy(dist, brg);
        const h = (p.track * Math.PI) / 180;
        const isHot = hot.has(p.icao24);
        return (
          <g key={p.icao24}>
            <line x1={x} y1={y} x2={x + Math.sin(h) * 6} y2={y - Math.cos(h) * 6} stroke={isHot ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} strokeWidth={0.6} />
            <circle cx={x} cy={y} r={isHot ? 2 : 1.2} fill={isHot ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'} />
            {isHot && <text x={x + 2.5} y={y - 2} fontSize={3.5} fill="hsl(var(--primary))">{p.callsign}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function PlaneDetail({ p, onClose }: { p: PlanePrediction | null; onClose: () => void }) {
  const { home, target, settings } = useApp();
  const frame = fieldOfView(settings.focalLengthMm, settings.sensor);
  const track = useMemo(() => (p ? planeTrack(p.plane, home, target, p.closest, Math.max(frame.w, frame.h)) : []), [p, home, target, frame.w, frame.h]);
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {p && (
          <>
            <DialogHeader><DialogTitle className="text-left">{p.plane.callsign} frente {target === 'Sol' ? 'ao Sol' : 'à Lua'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Kv k="Entrada no disco" v={fmtTime(p.entry, true)} />
              <Kv k="Margem de erro" v={`± ${fmtNum(p.errS, 0)} s · ± ${fmtNum(p.errDeg, 2)}°`} />
              <Kv k="Distância · altitude" v={`${fmtNum(p.rangeKm, 1)} km · ${fmtNum(p.plane.altM, 0)} m`} />
              <Kv k="Velocidade · rumo" v={`${fmtNum(p.plane.velocity * 3.6, 0)} km/h · ${fmtNum(p.plane.track, 0)}°`} />
            </div>
            <DiscDiagram target={target} radiusDeg={p.radiusDeg} marginDeg={settings.marginDegrees} frame={frame} track={track} entry={p.entry} errDeg={p.errDeg} />
            <p className="text-xs text-muted-foreground">A faixa vermelha mostra a incerteza da trajetória prevista.</p>
            <div className="space-y-2">
              <div className="text-sm font-medium">Locais para a passagem (até {settings.maxTravelKm} km): centro do disco e faixa até {fmtNum(settings.aircraftOffsetPercent, 0)} % do raio (Definições)</div>
              {p.alternatives.length === 0 && <div className="text-sm text-muted-foreground">A linha central não passa a menos de {settings.maxTravelKm} km.</div>}
              {p.alternatives.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <div>
                    <div className="font-semibold">{fmtNum(a.distKm, 1)} km para {compass(a.brg)}</div>
                    <div className="text-xs text-muted-foreground">{fmtCoord(a.lat, a.lon)} · às {fmtTime(a.t)} (± {fmtNum(p.errS, 0)} s)</div>
                    {a.band && (
                      <div className="mt-1 space-y-1 text-xs">
                        <div>Faixa utilizável: {fmtNum(a.band.halfWidthM * 2, 0)} m de largura (± {fmtNum(a.band.halfWidthM, 0)} m da linha central), para o avião passar em qualquer ponto do disco entre {fmtNum(a.band.frac * 100, 0)} % do raio abaixo e {fmtNum(a.band.frac * 100, 0)} % acima do centro.</div>
                        <div>Para passar mais abaixo no disco, desloque-se para {compass(a.band.belowBrg)}; mais acima, para {compass((a.band.belowBrg + 180) % 360)}. No disco: {fmtNum(a.band.discCentreS, 1)} s no centro · {fmtNum(a.band.discEdgeS, 1)} s nos limites da faixa.</div>
                        <div className="flex gap-3">
                          <a className="underline" href={mapsUrl(a.band.below.lat, a.band.below.lon)} target="_blank" rel="noreferrer">Limite inferior ({compass(a.band.belowBrg)})</a>
                          <a className="underline" href={mapsUrl(a.band.above.lat, a.band.above.lon)} target="_blank" rel="noreferrer">Limite superior ({compass((a.band.belowBrg + 180) % 360)})</a>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" asChild><a href={mapsUrl(a.lat, a.lon)} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-4 w-4" />Mapa</a></Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Os aviões passam depressa: estes locais só servem se conseguir lá chegar antes. A margem de erro aumenta com o tempo.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Kv = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-lg border border-border bg-card p-2"><div className="text-xs text-muted-foreground">{k}</div><div className="font-medium">{v}</div></div>
);
