import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { BellPlus, BellOff, CalendarPlus, MapPin, Navigation } from 'lucide-react';
import { createPlannedPass, deletePlannedPass } from 'zitejs/api';
import { useApp } from '../context/AppContext';
import { IssTransit, skyTrack } from '../lib/iss';
import { fieldOfView } from '../lib/astro';
import { compass } from '../lib/geo';
import { fmtCoord, fmtDay, fmtNum, fmtTime, mapsUrl } from '../lib/format';
import { qualityOf, weatherAt } from '../lib/weather';
import { downloadIcs } from '../lib/ics';
import DiscDiagram from './DiscDiagram';

export function passQuality(p: IssTransit, w: ReturnType<typeof weatherAt>, maxKm: number) {
  return qualityOf({ el: p.atSite.bodyEl, cloud: w?.cloud ?? null, rainProb: w?.rainProb ?? null, durationS: p.atSite.duration, distKm: p.siteDistKm, maxKm });
}

export function exportPass(p: IssTransit, leadMin: number) {
  const entry = p.atSite.entry ?? p.center;
  downloadIcs({
    title: `ISS frente ${p.target === 'Sol' ? 'ao Sol' : 'à Lua'}`,
    start: entry,
    durationS: p.atSite.duration,
    lat: p.site.lat,
    lon: p.site.lon,
    leadMin,
    description: `Entrada no disco: ${fmtTime(entry, true)}\nDuração: ${fmtNum(p.atSite.duration, 2)} s\nLocal ideal: ${fmtNum(p.siteDistKm, 1)} km para ${compass(p.siteBearing)} (${fmtCoord(p.site.lat, p.site.lon)})\nMapa: ${mapsUrl(p.site.lat, p.site.lon)}`,
  });
}

export default function PassDetail({ pass, onClose }: { pass: IssTransit | null; onClose: () => void }) {
  return (
    <Dialog open={!!pass} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">{pass && <Body p={pass} />}</DialogContent>
    </Dialog>
  );
}

function Body({ p }: { p: IssTransit }) {
  const { sat, settings, weather, planned, refreshPlanned } = useApp();
  const [where, setWhere] = useState<'site' | 'home'>('site');
  const [busy, setBusy] = useState(false);
  const frame = fieldOfView(settings.focalLengthMm, settings.sensor);
  const obs = where === 'site' ? p.site : { lat: settings.latitude, lon: settings.longitude };
  const a = where === 'site' ? p.atSite : p.atHome;
  const track = useMemo(() => (sat ? skyTrack(sat, p.target, obs, p.center, Math.max(frame.w, frame.h)) : []), [sat, p, where]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = weatherAt(weather, p.center);
  const q = passQuality(p, w, settings.maxTravelKm);
  const entry = p.atSite.entry ?? p.center;
  const existing = planned.find((x) => Math.abs(new Date(x.discEntryTime).getTime() - entry) < 5000);

  const toggleAlarm = async () => {
    setBusy(true);
    try {
      if (existing) await deletePlannedPass({ id: existing.id });
      else await createPlannedPass({
        title: `${fmtDay(entry)} · ${fmtNum(p.siteDistKm, 1)} km ${compass(p.siteBearing)}`, object: 'ISS', target: p.target,
        discEntryTime: new Date(entry).toISOString(), secondsInDisc: p.atSite.duration,
        siteLatitude: p.site.lat, siteLongitude: p.site.lon, quality: q.label,
      });
      await refreshPlanned();
      toast.success(existing ? 'Alarme removido' : 'Alarme ativado');
    } catch {
      toast.error('Não foi possível alterar o alarme');
    } finally { setBusy(false); }
  };

  const bbox = `${p.site.lon - 0.12},${p.site.lat - 0.08},${p.site.lon + 0.12},${p.site.lat + 0.08}`;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-left">ISS frente {p.target === 'Sol' ? 'ao Sol' : 'à Lua'} · {fmtDay(entry)}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-semibold">{p.siteDistKm < 0.5 ? 'Está no local ideal' : `${fmtNum(p.siteDistKm, 1)} km para ${compass(p.siteBearing)}`}</div>
            <div className="text-sm text-muted-foreground">Rumo {fmtNum(p.siteBearing, 0)}° · nota {q.label} ({q.score}/100)</div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm">
            <Info k="Coordenadas" v={fmtCoord(p.site.lat, p.site.lon)} />
            <Info k="Entrada nesse local" v={fmtTime(entry, true)} />
            <Info k="Tempo no disco" v={`${fmtNum(p.atSite.duration, 2)} s`} />
            <Info k="Altura · distância ISS" v={`${fmtNum(p.atSite.bodyEl, 0)}° · ${fmtNum(p.atSite.issRangeKm, 0)} km`} />
            <Info k="No seu local" v={p.atHome.minSep <= p.atHome.radiusDeg ? `${fmtNum(p.atHome.minSep, 2)}° do centro (no disco)` : `${fmtNum(p.atHome.minSep, 2)}° do centro (falha)`} />
            <Info k="Verificação no local sugerido" v={`${fmtNum(p.atSite.minSep, 3)}° do centro ${p.atSite.minSep < 0.02 ? '✓' : ''}`} />
            <Info k="Nuvens · chuva" v={w ? `${w.cloud}% · ${w.rainProb}%` : 'Sem previsão'} />
            {p.band && <Info k="Faixa utilizável" v={`${fmtNum(p.band.halfWidthM / 500, 1)} km de largura (${fmtNum(p.band.frac * 100, 0)} % do raio abaixo a ${fmtNum(p.band.frac * 100, 0)} % acima do centro) · ${fmtNum(p.band.discCentreS, 2)} s no centro, ${fmtNum(p.band.discEdgeS, 2)} s nos limites`} />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><a href={mapsUrl(p.site.lat, p.site.lon)} target="_blank" rel="noreferrer"><Navigation className="mr-2 h-4 w-4" />Abrir no mapa</a></Button>
            <Button variant="outline" onClick={() => exportPass(p, settings.issAlertMinutes)}><CalendarPlus className="mr-2 h-4 w-4" />Calendário</Button>
            <Button variant="outline" onClick={toggleAlarm} disabled={busy}>{existing ? <BellOff className="mr-2 h-4 w-4" /> : <BellPlus className="mr-2 h-4 w-4" />}{existing ? 'Desativar alarme' : 'Ativar alarme'}</Button>
          </div>
        </div>
        <div className="space-y-2">
          <iframe title="Mapa" className="h-56 w-full rounded-lg border border-border" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.site.lat},${p.site.lon}`} />
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{p.siteOffset === 'centro' ? 'Local ideal na linha central do trânsito' : `Local no limite ${p.siteOffset === 'abaixo' ? 'inferior' : 'superior'} da faixa (passagem a ${fmtNum((p.band?.frac ?? 0) * 100, 0)} % do raio ${p.siteOffset === 'abaixo' ? 'abaixo' : 'acima'} do centro); a linha central fica fora do alcance`}</div>
        </div>
      </div>
      <div className="space-y-3">
        <Tabs value={where} onValueChange={(v) => setWhere(v as 'site' | 'home')}>
          <TabsList><TabsTrigger value="site">Vista do local ideal</TabsTrigger><TabsTrigger value="home">Vista do meu local</TabsTrigger></TabsList>
        </Tabs>
        <DiscDiagram target={p.target} radiusDeg={a.radiusDeg} marginDeg={settings.marginDegrees} frame={frame} track={track} entry={a.entry} />
      </div>
    </>
  );
}

const Info = ({ k, v }: { k: string; v: string }) => (
  <div><div className="text-xs text-muted-foreground">{k}</div><div className="font-medium">{v}</div></div>
);
