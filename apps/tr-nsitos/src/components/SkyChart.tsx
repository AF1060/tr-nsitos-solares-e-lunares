import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import { bodyTopo, moonInfo, riseSet, Target } from '../lib/astro';
import type { LatLon } from '../lib/geo';
import { fmtHM, fmtNum } from '../lib/format';

const ALT_MIN = -30, ALT_MAX = 90;
const W = 720, H = 260;
const X = (az: number) => (az / 360) * W;
const Y = (el: number) => ((ALT_MAX - el) / (ALT_MAX - ALT_MIN)) * H;

function curve(target: Target, day: Date, home: LatLon) {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const segs: string[][] = [[]];
  let prevAz = -1;
  for (let m = 0; m <= 1440; m += 10) {
    const b = bodyTopo(target, new Date(start.getTime() + m * 60_000), home);
    if (prevAz >= 0 && Math.abs(b.az - prevAz) > 180) segs.push([]);
    segs[segs.length - 1].push(`${X(b.az).toFixed(1)},${Y(Math.max(b.el, ALT_MIN)).toFixed(1)}`);
    prevAz = b.az;
  }
  return segs.filter((s) => s.length > 1).map((s) => s.join(' '));
}

export function visibility(target: Target, now: Date, home: LatLon) {
  const b = bodyTopo(target, now, home);
  const sun = target === 'Sol' ? b : bodyTopo('Sol', now, home);
  const rs = riseSet(target, now, home);
  if (b.el < 0) return { above: false, visible: false, text: `Abaixo do horizonte${rs.rise && rs.rise > now ? ` · nasce às ${fmtHM(rs.rise)}` : ''}` };
  const sets = rs.set && rs.set > now ? ` · põe-se às ${fmtHM(rs.set)}` : '';
  if (target === 'Sol') return { above: true, visible: true, text: `Acima do horizonte${sets}` };
  const m = moonInfo(now);
  if (m.illum < 0.03) return { above: true, visible: false, text: `Acima do horizonte, mas invisível (Lua Nova)${sets}` };
  if (sun.el > 0) return { above: true, visible: m.illum > 0.15, text: `Acima do horizonte · ${m.illum > 0.15 ? 'visível de dia' : 'difícil de ver de dia'}${sets}` };
  return { above: true, visible: true, text: `Acima do horizonte · visível${sets}` };
}

export default function SkyChart({ target, now, home }: { target: Target; now: Date; home: LatLon }) {
  const dayKey = now.toDateString();
  const curves = useMemo(() => ({ Sol: curve('Sol', now, home), Lua: curve('Lua', now, home) }), [dayKey, home]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodies = (['Sol', 'Lua'] as Target[]).map((t) => ({ t, b: bodyTopo(t, now, home), v: visibility(t, now, home) }));
  const color = (t: Target) => (t === 'Sol' ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))');

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Horizonte · posição do Sol e da Lua</div>
        <div className="flex flex-wrap gap-2">
          {bodies.map(({ t, v }) => (
            <span key={t} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${t === target ? 'border-primary/60' : 'border-border'}`}>
              {v.above ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {v.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
              <b>{t}</b> {v.text}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
        <rect x={0} y={Y(0)} width={W} height={H - Y(0)} fill="hsl(var(--muted))" />
        {[30, 60].map((e) => <line key={e} x1={0} x2={W} y1={Y(e)} y2={Y(e)} stroke="hsl(var(--border))" strokeDasharray="3 4" />)}
        {[30, 60].map((e) => <text key={e} x={4} y={Y(e) - 3} fontSize={10} fill="hsl(var(--muted-foreground))">{e}°</text>)}
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="hsl(var(--foreground))" strokeOpacity={0.6} />
        <text x={4} y={Y(0) + 12} fontSize={10} fill="hsl(var(--muted-foreground))">horizonte</text>
        {(['Sol', 'Lua'] as Target[]).map((t) => curves[t].map((pts, i) => (
          <polyline key={`${t}${i}`} points={pts} fill="none" stroke={color(t)} strokeOpacity={t === target ? 0.8 : 0.35} strokeWidth={1.5} strokeDasharray="4 4" />
        )))}
        {bodies.map(({ t, b }) => (
          <g key={t} opacity={b.el < 0 ? 0.45 : 1}>
            <circle cx={X(b.az)} cy={Y(Math.max(b.el, ALT_MIN + 2))} r={t === target ? 9 : 6} fill={color(t)} stroke="hsl(var(--background))" strokeWidth={2} />
            <text x={X(b.az) + 12} y={Y(Math.max(b.el, ALT_MIN + 2)) + 4} fontSize={11} fill="hsl(var(--foreground))">{t} {fmtNum(b.el, 1)}°</text>
          </g>
        ))}
        {['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'N'].map((d, i) => (
          <text key={i} x={Math.min(Math.max(X(i * 45), 6), W - 6)} y={H + 14} fontSize={11} textAnchor="middle" fill="hsl(var(--muted-foreground))">{d}</text>
        ))}
      </svg>
    </div>
  );
}
