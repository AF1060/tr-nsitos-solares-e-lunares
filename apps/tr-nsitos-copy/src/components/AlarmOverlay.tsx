import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@project/components/ui/button';
import { BellRing, VolumeX, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAircraft } from '../context/AircraftContext';
import { alertChime, beep, notify, speak } from '../lib/alarm';
import { fmtCountdown, fmtTime, fmtNum } from '../lib/format';

interface AlarmEvent { key: string; label: string; entry: number; lead: number; detail: string }

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    void req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release(); };
  }, [active]);
}

export default function AlarmOverlay() {
  const { planned, settings } = useApp();
  const { predictions } = useAircraft();
  const [now, setNow] = useState(Date.now());
  const fired = useRef(new Set<string>());
  const beeped = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  const events = useMemo<AlarmEvent[]>(() => {
    const iss = planned.filter((p) => p.alarmEnabled).map((p) => ({
      key: p.id, label: `${p.object} · entrada no disco ${p.target === 'Sol' ? 'solar' : 'lunar'}`,
      entry: new Date(p.discEntryTime).getTime(), lead: settings.issAlertMinutes * 60_000,
      detail: `${fmtNum(p.secondsInDisc, 2)} s no disco · ${p.title}`,
    }));
    const air = predictions.filter((p) => p.entry !== null && p.confidence !== 'baixa').map((p) => ({
      key: `air-${p.plane.icao24}-${Math.round(p.entry! / 60_000)}`, label: `${p.plane.callsign} · entrada no disco`,
      entry: p.entry!, lead: settings.aircraftAlertSeconds * 1000,
      detail: `± ${fmtNum(p.errS, 0)} s · ${fmtNum(p.inDiscS, 1)} s no disco`,
    }));
    return [...iss, ...air].sort((a, b) => a.entry - b.entry);
  }, [planned, predictions, settings.issAlertMinutes, settings.aircraftAlertSeconds]);

  useWakeLock(events.some((e) => e.entry - now < 20 * 60_000 && e.entry - now > -10_000));

  const active = events.find((e) => !dismissed.has(e.key) && now >= e.entry - e.lead && now <= e.entry + 8000);

  useEffect(() => {
    for (const e of events) {
      if (now >= e.entry - e.lead && now < e.entry && !fired.current.has(e.key)) {
        fired.current.add(e.key);
        alertChime();
        const secs = Math.round((e.entry - now) / 1000);
        const when = secs >= 120 ? `${Math.round(secs / 60)} minutos` : `${secs} segundos`;
        if (settings.voiceAlerts) speak(`Atenção. ${e.label.split(' · ')[0]} entra no disco dentro de ${when}.`);
        notify('Trânsito próximo', `${e.label} às ${fmtTime(e.entry)}`);
      }
    }
    if (active && !muted) {
      const s = Math.ceil((active.entry - now) / 1000);
      const k = `${active.key}-${s}`;
      if (s >= 0 && s <= 10 && !beeped.current.has(k)) {
        beeped.current.add(k);
        beep(s === 0 ? 1320 : 880, s === 0 ? 0.6 : 0.12);
      }
    }
  }, [now, events, active, muted, settings.voiceAlerts]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-primary p-6 text-center text-primary-foreground"
        >
          <BellRing className="h-10 w-10 animate-pulse" />
          <div className="text-sm font-semibold uppercase tracking-widest">{active.label}</div>
          <div className="font-mono text-6xl font-semibold tabular-nums sm:text-8xl">{fmtCountdown(active.entry - now)}</div>
          <div className="text-sm opacity-80">Entrada às {fmtTime(active.entry, true)} · {active.detail} · ecrã mantido ligado</div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setMuted((m) => !m)}><VolumeX className="mr-2 h-4 w-4" />{muted ? 'Som ligado' : 'Silenciar'}</Button>
            <Button variant="secondary" onClick={() => setDismissed((d) => new Set(d).add(active.key))}><X className="mr-2 h-4 w-4" />Dispensar</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
