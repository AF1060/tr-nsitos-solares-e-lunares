import { useState } from 'react';
import { Mountain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BAND, eqToHor, galHor } from '../lib/milkyway';
import { CONSTELLATIONS } from '../lib/stars';
import { horizonAt, useTerrainHorizon } from '../lib/terrain';
import { compass } from '../lib/geo';
import { fmtHM, fmtNum } from '../lib/format';
import { cn } from '@project/components/lib/utils';

const S = 3, HALF = 70, TOP = 72, TRAIL_H = 3;
const D = Math.PI / 180;

export default function MilkyPanorama({ t, bestAz }: { t: Date; bestAz: number | null }) {
  const { home } = useApp();
  const { horizon, loading } = useTerrainHorizon(home);
  const [mode, setMode] = useState<'follow' | 'best'>('best');
  const gc = galHor(0, 0, t, home);
  const viewAz = mode === 'best' && bestAz != null ? bestAz : gc.az;
  const proj = (alt: number, az: number) => {
    const dx = ((az - viewAz + 540) % 360) - 180;
    return { x: dx * S, y: -alt * S, ok: Math.abs(dx) <= HALF + 5 };
  };
  const hor = (ra: number, dec: number, d: Date) => { const h = eqToHor(ra * D, dec * D, d, home); return proj(h.alt, h.az); };

  const ground: string[] = [];
  for (let dx = -HALF; dx <= HALF; dx += 1) ground.push(`${dx * S},${(-horizonAt(horizon, viewAz + dx) * S).toFixed(1)}`);
  const g = proj(gc.alt, gc.az);
  const ticks = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Vista voltado para o núcleo · {compass(viewAz, 16)} ({fmtNum(viewAz, 0)}°)</div>
        <div className="flex rounded-full border border-border p-0.5 text-xs">
          {([['best', 'Direção do melhor momento'], ['follow', 'Seguir o núcleo']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} disabled={k === 'best' && bestAz == null} className={cn('rounded-full px-2.5 py-1', mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`${-HALF * S} ${-TOP * S} ${2 * HALF * S} ${(TOP + 8) * S}`} className="w-full">
        <defs>
          <clipPath id="pano"><rect x={-HALF * S} y={-TOP * S} width={2 * HALF * S} height={(TOP + 8) * S} /></clipPath>
          <marker id="arr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="hsl(var(--muted-foreground))" /></marker>
        </defs>
        <g clipPath="url(#pano)">
          <rect x={-HALF * S} y={-TOP * S} width={2 * HALF * S} height={(TOP + 8) * S} fill="hsl(var(--foreground))" fillOpacity={0.05} />
          {[15, 30, 45, 60].map((a) => <g key={a}><line x1={-HALF * S} x2={HALF * S} y1={-a * S} y2={-a * S} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" /><text x={-HALF * S + 3} y={-a * S - 2} fontSize={7} fill="hsl(var(--muted-foreground))">{a}°</text></g>)}
          {BAND.map((p, i) => { const h = galHor(p.l, p.b, t, home); const q = proj(h.alt, h.az); return q.ok ? <circle key={i} cx={q.x} cy={q.y} r={12} fill="hsl(var(--chart-2))" fillOpacity={p.w * 0.13} /> : null; })}
          {CONSTELLATIONS.map((c) => {
            const pos = Object.fromEntries(Object.entries(c.stars).map(([k, [ra, dec]]) => [k, hor(ra, dec, t)]));
            const vis = Object.values(pos).filter((p) => p.ok);
            if (!vis.length) return null;
            const first = Object.values(c.stars)[0];
            const trail: string[] = [];
            for (let m = 0; m <= TRAIL_H * 60; m += 10) { const q = hor(first[0], first[1], new Date(t.getTime() + m * 60000)); if (!q.ok) break; trail.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
            const lab = vis.reduce((a, b) => (a.y < b.y ? a : b));
            return (
              <g key={c.name}>
                {trail.length > 1 && <polyline points={trail.join(' ')} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={0.8} strokeDasharray="1.5 2.5" markerEnd="url(#arr)" />}
                {c.lines.map(([a, b], i) => pos[a].ok && pos[b].ok && <line key={i} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={0.8} />)}
                {Object.entries(pos).map(([k, p]) => p.ok && <circle key={k} cx={p.x} cy={p.y} r={k === 'alp' ? 2.2 : 1.5} fill="hsl(var(--foreground))" />)}
                <text x={lab.x + 4} y={lab.y - 5} fontSize={8} fill="hsl(var(--foreground))" fillOpacity={0.85}>{c.name}</text>
              </g>
            );
          })}
          {g.ok && <g><circle cx={g.x} cy={g.y} r={7} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.4} /><text x={g.x + 10} y={g.y + 3} fontSize={8} fill="hsl(var(--primary))">Núcleo</text></g>}
          <polygon points={`${-HALF * S},${8 * S} ${ground.join(' ')} ${HALF * S},${8 * S}`} fill="hsl(var(--muted))" />
          <polyline points={ground.join(' ')} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.7} strokeWidth={1} />
          <line x1={-HALF * S} x2={HALF * S} y1={0} y2={0} stroke="hsl(var(--foreground))" strokeOpacity={0.3} strokeDasharray="4 3" />
          {ticks.map((dx) => <text key={dx} x={dx * S} y={6 * S} fontSize={8} textAnchor="middle" fill="hsl(var(--muted-foreground))">{compass(viewAz + dx, 16)}</text>)}
        </g>
      </svg>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span className="flex items-center gap-1"><Mountain className="h-3 w-3" />{loading ? 'A calcular o relevo…' : horizon ? 'Linha sólida: horizonte real do relevo (até 35 km)' : 'Relevo indisponível: horizonte plano'}</span>
        <span>Linha tracejada horizontal: horizonte teórico (0°)</span>
        <span>Pontilhado com seta: deslocação nas próximas {TRAIL_H} h a partir das {fmtHM(t)}</span>
        <span>Faixa azulada: Via Láctea · ângulo horizontal de 140°</span>
      </div>
    </div>
  );
}
