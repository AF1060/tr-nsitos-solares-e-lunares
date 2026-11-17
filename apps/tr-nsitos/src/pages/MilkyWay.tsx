import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Sparkles } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Slider } from '@project/components/ui/slider';
import { DatePicker } from '@project/components/ui/date-picker';
import { useApp } from '../context/AppContext';
import { BAND, darkness, galHor, nightWindow, skyState } from '../lib/milkyway';
import { bodyTopo } from '../lib/astro';
import { compass } from '../lib/geo';
import { fmtHM, fmtNum } from '../lib/format';

const STEP = 5; // minutos por passo

export default function MilkyWay() {
  const { home, settings } = useApp();
  const [day, setDay] = useState<Date>(() => { const d = new Date(); if (d.getHours() < 12) d.setDate(d.getDate() - 1); return d; });
  const night = useMemo(() => nightWindow(day, home, settings.minElevationDegrees), [day, home, settings.minElevationDegrees]);
  const [min, setMin] = useState(() => Math.max(0, Math.min(1440, Math.round((Date.now() - night.start) / 60000))));
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMin((m) => (m + STEP > 1440 ? 0 : m + STEP)), 120);
    return () => clearInterval(id);
  }, [playing]);

  const t = new Date(night.start + min * 60000);
  const s = skyState(t, home);
  const gcDir = `${compass(s.gc.az, 16)} (${fmtNum(s.gc.az, 0)}°)`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-primary" />Via Láctea</h1>
        <p className="text-sm text-muted-foreground">Onde e quando aparece no céu, vista do seu local</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card k="Núcleo galáctico visível" v={night.gcFrom ? `${fmtHM(night.gcFrom)} – ${fmtHM(night.gcTo)}` : 'Não visível nesta noite'} sub={night.gcFrom ? `com céu escuro e acima de ${settings.minElevationDegrees}°` : `abaixo de ${settings.minElevationDegrees}° durante a noite escura`} />
        <Card k="Melhor momento" v={night.best ? fmtHM(night.best.t) : '—'} sub={night.best ? `${fmtNum(night.best.alt, 0)}° de altura, para ${compass(night.best.az, 16)}` : undefined} />
        <Card k="Noite astronómica" v={night.darkFrom ? `${fmtHM(night.darkFrom)} – ${fmtHM(night.darkTo)}` : 'Sem noite escura'} />
        <Card k="Lua" v={`${fmtNum(s.moonIllum * 100, 0)}% iluminada`} sub={s.moon > 0 ? `acima do horizonte às ${fmtHM(t)} — atrapalha` : `abaixo do horizonte às ${fmtHM(t)}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 lg:col-span-2">
          <SkyDome t={t} />
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Mapa do céu: centro = zénite, rebordo = horizonte</span>
            <span>Segure o telemóvel por cima da cabeça com o N para norte</span>
            <span><span className="text-primary">◉</span> Núcleo galáctico (Sagitário)</span>
            <span>Círculo tracejado: altura mínima ({settings.minElevationDegrees}°)</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <DatePicker value={day} onChange={(d) => d && setDay(d)} />
            <div className="flex items-center justify-between">
              <span className="text-3xl font-semibold tabular-nums">{fmtHM(t)}</span>
              <Button size="sm" variant="outline" onClick={() => setPlaying(!playing)}>{playing ? <><Pause className="mr-1 h-4 w-4" />Pausar</> : <><Play className="mr-1 h-4 w-4" />Simular noite</>}</Button>
            </div>
            <Slider value={[min]} min={0} max={1440} step={STEP} onValueChange={([v]) => setMin(v)} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>12:00</span><span>meia-noite</span><span>12:00</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card k="Céu" v={darkness(s.sun)} />
            <Card k="Faixa acima do horizonte" v={`${fmtNum(s.fracAbove * 100, 0)}%`} />
            <Card k="Núcleo · altura" v={`${fmtNum(s.gc.alt, 0)}°`} />
            <Card k="Núcleo · direção" v={gcDir} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkyDome({ t }: { t: Date }) {
  const { home, settings } = useApp();
  // Norte em cima, Este à esquerda (como olhando para cima)
  const xy = (alt: number, az: number) => { const r = ((90 - alt) / 90) * 100; return [-r * Math.sin(az * Math.PI / 180), -r * Math.cos(az * Math.PI / 180)]; };
  const pts = BAND.map((p) => ({ ...p, h: galHor(p.l, p.b, t, home) })).filter((p) => p.h.alt > -2);
  const gc = galHor(0, 0, t, home);
  const moon = bodyTopo('Lua', t, home);
  const sunEl = bodyTopo('Sol', t, home).el;
  const sky = sunEl > 0 ? 0.35 : sunEl > -12 ? 0.6 : 1;
  const [gx, gy] = xy(gc.alt, gc.az);
  const [mx, my] = xy(moon.el, moon.az);
  const rMin = ((90 - settings.minElevationDegrees) / 90) * 100;
  return (
    <svg viewBox="-112 -112 224 224" className="mx-auto aspect-square max-h-[540px] w-full">
      <defs><clipPath id="dome"><circle r={100} /></clipPath></defs>
      <circle r={100} fill="hsl(var(--foreground))" fillOpacity={0.06} stroke="hsl(var(--border))" />
      <g clipPath="url(#dome)">
        {pts.map((p, i) => { const [x, y] = xy(p.h.alt, p.h.az); return <circle key={i} cx={x} cy={y} r={4.2} fill="hsl(var(--chart-2))" fillOpacity={p.w * 0.22 * sky} />; })}
      </g>
      {[30, 60].map((a) => <circle key={a} r={((90 - a) / 90) * 100} fill="none" stroke="hsl(var(--border))" strokeWidth={0.4} />)}
      <circle r={rMin} fill="none" stroke="hsl(var(--destructive))" strokeOpacity={0.6} strokeWidth={0.5} strokeDasharray="2 2" />
      {['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map((d, i) => { const [x, y] = xy(-9, i * 45); return <text key={d} x={x} y={y + 2} fontSize={d.length > 1 ? 4.5 : 6} textAnchor="middle" fill="hsl(var(--muted-foreground))">{d}</text>; })}
      {gc.alt > 0 && <g><circle cx={gx} cy={gy} r={4} fill="none" stroke="hsl(var(--primary))" strokeWidth={1} /><circle cx={gx} cy={gy} r={1.5} fill="hsl(var(--primary))" /><text x={gx + 6} y={gy + 1.5} fontSize={4.5} fill="hsl(var(--primary))">Núcleo</text></g>}
      {moon.el > 0 && <g><circle cx={mx} cy={my} r={3.5} fill="hsl(var(--foreground))" /><text x={mx + 5} y={my + 1.5} fontSize={4.5} fill="hsl(var(--foreground))">Lua</text></g>}
    </svg>
  );
}

const Card = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <div className="text-xs text-muted-foreground">{k}</div>
    <div className="font-semibold">{v}</div>
    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
  </div>
);
