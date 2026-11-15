import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Crosshair, LocateFixed } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Slider } from '@project/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Skeleton } from '@project/components/ui/skeleton';
import { useApp, Settings } from '../context/AppContext';
import { fieldOfView, SENSORS } from '../lib/astro';
import { alertChime, beep, notify, requestAlarmPermissions, speak } from '../lib/alarm';
import { fmtNum } from '../lib/format';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-4 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">{title}</h2>{children}</section>
);

function Range({ label, value, unit, min, max, step, onChange }: { label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono font-medium">{fmtNum(value, step < 1 ? 1 : 0)} {unit}</span></div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

export default function SettingsPage() {
  const { settings: s, update, loaded, locate, gpsStatus } = useApp();
  const [lat, setLat] = useState(String(s.latitude));
  const [lon, setLon] = useState(String(s.longitude));
  useEffect(() => { setLat(String(s.latitude)); setLon(String(s.longitude)); }, [s.latitude, s.longitude]);
  const fov = fieldOfView(s.focalLengthMm, s.sensor);
  const set = (p: Partial<Settings>) => update(p);

  if (!loaded) return <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>;

  const saveCoords = () => {
    const la = Number(lat.replace(',', '.')), lo = Number(lon.replace(',', '.'));
    if (!Number.isFinite(la) || Math.abs(la) > 90 || !Number.isFinite(lo) || Math.abs(lo) > 180) { toast.error('Coordenadas inválidas'); return; }
    set({ useGps: false, latitude: la, longitude: lo });
    toast.success('Localização atualizada');
  };

  const testAlarm = async () => {
    const perm = await requestAlarmPermissions();
    alertChime();
    if (s.voiceAlerts) setTimeout(() => speak('Teste de alarme. A ISS entra no disco dentro de 15 minutos.'), 700);
    notify('Teste de alarme', 'As notificações estão a funcionar.');
    [3, 2, 1, 0].forEach((n, i) => setTimeout(() => beep(n === 0 ? 1320 : 880, n === 0 ? 0.6 : 0.12), 4000 + i * 1000));
    if (perm === 'denied') toast.warning('As notificações estão bloqueadas no navegador.');
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Definições</h1>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Localização">
          <div className="flex items-center justify-between">
            <Label htmlFor="gps">Usar GPS</Label>
            <Switch id="gps" checked={s.useGps} onCheckedChange={(v) => set({ useGps: v })} />
          </div>
          {s.useGps ? (
            <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
              <span className="font-mono">{fmtNum(s.latitude, 5)}, {fmtNum(s.longitude, 5)}</span>
              <Button size="sm" variant="outline" onClick={locate} disabled={gpsStatus === 'pending'}><LocateFixed className="mr-1 h-4 w-4" />{gpsStatus === 'pending' ? 'A localizar…' : 'Atualizar'}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="space-y-1"><Label>Latitude</Label><Input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></div>
              <div className="space-y-1"><Label>Longitude</Label><Input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" /></div>
              <Button onClick={saveCoords}><Crosshair className="h-4 w-4" /></Button>
            </div>
          )}
          <Range label="Distância máxima de deslocação" value={s.maxTravelKm} unit="km" min={0} max={100} step={1} onChange={(n) => set({ maxTravelKm: n })} />
          <Range label="Altura mínima do Sol/Lua" value={s.minElevationDegrees} unit="°" min={0} max={45} step={1} onChange={(n) => set({ minElevationDegrees: n })} />
          <div className="flex items-center justify-between">
            <Label>Alvo por omissão</Label>
            <Select value={s.defaultTarget} onValueChange={(v) => set({ defaultTarget: v as 'Sol' | 'Lua' })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Sol">Sol</SelectItem><SelectItem value="Lua">Lua</SelectItem></SelectContent>
            </Select>
          </div>
        </Card>
        <Card title="Equipamento">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Distância focal (mm)</Label>
              <Input type="number" min={10} value={s.focalLengthMm} onChange={(e) => Number(e.target.value) >= 10 && set({ focalLengthMm: Number(e.target.value) })} />
            </div>
            <div className="space-y-1"><Label>Sensor</Label>
              <Select value={s.sensor} onValueChange={(v) => set({ sensor: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(SENSORS).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">Enquadramento: <span className="font-mono">{fmtNum(fov.w, 2)}° × {fmtNum(fov.h, 2)}°</span></div>
          <Range label="Orla do disco" value={s.marginDegrees} unit="°" min={0} max={5} step={0.1} onChange={(n) => set({ marginDegrees: n })} />
        </Card>
        <Card title="Alarmes">
          <Range label="Aviso antecipado ISS" value={s.issAlertMinutes} unit="min" min={1} max={60} step={1} onChange={(n) => set({ issAlertMinutes: n })} />
          <Range label="Aviso antecipado aviões" value={s.aircraftAlertSeconds} unit="s" min={10} max={300} step={5} onChange={(n) => set({ aircraftAlertSeconds: n })} />
          <div className="flex items-center justify-between"><Label htmlFor="voice">Aviso por voz</Label><Switch id="voice" checked={s.voiceAlerts} onCheckedChange={(v) => set({ voiceAlerts: v })} /></div>
          <Button variant="outline" onClick={testAlarm}><BellRing className="mr-2 h-4 w-4" />Testar alarme</Button>
          <p className="text-xs text-muted-foreground">O som, a voz e a contagem só funcionam com a app aberta. Para ser avisado com a app fechada, use o botão “Calendário” em cada passagem.</p>
        </Card>
      </div>
    </div>
  );
}
