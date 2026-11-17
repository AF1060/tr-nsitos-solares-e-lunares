import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@project/components/ui/button';
import { Slider } from '@project/components/ui/slider';
import { Play, Square } from 'lucide-react';
import type { SkyPoint } from '../lib/iss';
import { fmtNum, fmtTime } from '../lib/format';

interface Props {
  target: 'Sol' | 'Lua';
  radiusDeg: number;
  marginDeg: number;
  frame: { w: number; h: number };
  track: SkyPoint[];
  entry: number | null;
  errDeg?: number;
}

export default function DiscDiagram({ target, radiusDeg, marginDeg, frame, track, entry, errDeg }: Props) {
  const [margin, setMargin] = useState(marginDeg);
  const [speed, setSpeed] = useState(1);
  const [simT, setSimT] = useState<number | null>(null);
  const raf = useRef<number>();
  useEffect(() => setMargin(marginDeg), [marginDeg]);

  const half = Math.max(frame.w / 2, radiusDeg + margin) * 1.12;
  const vw = half * 2;
  const vh = Math.max(frame.h / 2, radiusDeg + margin) * 1.12 * 2;
  const S = 100;
  const pts = track.map((p) => `${p.x * S},${-p.y * S}`).join(' ');
  const entryPt = useMemo(() => (entry === null ? null : track.reduce((b, p) => (Math.abs(p.t - entry) < Math.abs(b.t - entry) ? p : b), track[0])), [track, entry]);

  const play = () => {
    if (track.length < 2) return;
    const t0 = track[0].t, t1 = track[track.length - 1].t, start = performance.now();
    const step = () => {
      const t = t0 + (performance.now() - start) * speed;
      if (t > t1) { setSimT(null); return; }
      setSimT(t);
      raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current!);
    raf.current = requestAnimationFrame(step);
  };
  const stop = () => { cancelAnimationFrame(raf.current!); setSimT(null); };
  useEffect(() => () => cancelAnimationFrame(raf.current!), []);

  const dot = simT === null ? null : track.find((p) => p.t >= simT) ?? null;
  const bodyFill = target === 'Sol' ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))';

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--sky))]">
        <svg viewBox={`${-half * S} ${(-vh / 2) * S} ${vw * S} ${vh * S}`} className="aspect-[4/3] w-full">
          <defs>
            <radialGradient id="glow"><stop offset="60%" stopColor={bodyFill} stopOpacity="0.35" /><stop offset="100%" stopColor={bodyFill} stopOpacity="0" /></radialGradient>
          </defs>
          <circle r={(radiusDeg + 0.25) * S} fill="url(#glow)" />
          <circle r={radiusDeg * S} fill={bodyFill} opacity={0.9} />
          <circle r={(radiusDeg + margin) * S} fill="none" stroke="hsl(var(--muted-foreground))" strokeDasharray={`${0.06 * S} ${0.05 * S}`} strokeWidth={0.012 * S} />
          <rect x={(-frame.w / 2) * S} y={(-frame.h / 2) * S} width={frame.w * S} height={frame.h * S} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.7} strokeWidth={0.012 * S} />
          {errDeg ? <polyline points={pts} fill="none" stroke="hsl(var(--destructive))" strokeOpacity={0.18} strokeWidth={errDeg * 2 * S} strokeLinecap="round" /> : null}
          <polyline points={pts} fill="none" stroke="hsl(var(--foreground))" strokeWidth={0.012 * S} strokeDasharray={`${0.03 * S} ${0.02 * S}`} />
          {entryPt && (
            <g>
              <circle cx={entryPt.x * S} cy={-entryPt.y * S} r={0.025 * S} fill="hsl(var(--foreground))" />
              <text x={entryPt.x * S + 0.04 * S} y={-entryPt.y * S - 0.04 * S} fontSize={0.075 * S} fill="hsl(var(--foreground))">{fmtTime(entry, true)}</text>
            </g>
          )}
          {dot && <circle cx={dot.x * S} cy={-dot.y * S} r={0.03 * S} fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth={0.008 * S} />}
          <text x={(-frame.w / 2) * S + 0.03 * S} y={(frame.h / 2) * S - 0.03 * S} fontSize={0.06 * S} fill="hsl(var(--muted-foreground))">{fmtNum(frame.w, 2)}° × {fmtNum(frame.h, 2)}°</text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {simT === null
          ? <Button size="sm" variant="outline" onClick={play} disabled={track.length < 2}><Play className="mr-1 h-4 w-4" />Simular passagem</Button>
          : <Button size="sm" variant="outline" onClick={stop}><Square className="mr-1 h-4 w-4" />Parar</Button>}
        <div className="flex rounded-md border border-border">
          {[1, 0.25, 0.1].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 text-xs ${speed === s ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}>{s === 1 ? 'Real' : `${s}×`}</button>
          ))}
        </div>
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className="whitespace-nowrap text-muted-foreground">Orla {fmtNum(margin, 1)}°</span>
          <Slider value={[margin]} min={0} max={5} step={0.1} onValueChange={(v) => setMargin(v[0])} />
        </div>
      </div>
      {track.length < 2 && <p className="text-xs text-muted-foreground">O trajeto não atravessa o enquadramento neste local.</p>}
    </div>
  );
}
