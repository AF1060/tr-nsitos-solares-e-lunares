const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function downloadIcs(o: {
  title: string;
  start: number;
  durationS: number;
  lat: number;
  lon: number;
  description: string;
  leadMin: number;
}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Transitos//PT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${o.start}-${Math.random().toString(36).slice(2)}@transitos`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(o.start - 60_000)}`,
    `DTEND:${stamp(o.start + Math.max(60, o.durationS) * 1000)}`,
    `SUMMARY:${esc(o.title)}`,
    `LOCATION:${o.lat.toFixed(5)}\\, ${o.lon.toFixed(5)}`,
    `GEO:${o.lat.toFixed(5)};${o.lon.toFixed(5)}`,
    `DESCRIPTION:${esc(o.description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(o.title)}`, `TRIGGER:-PT${Math.round(o.leadMin)}M`, 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:AUDIO', `DESCRIPTION:${esc(o.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `passagem-${new Date(o.start).toISOString().slice(0, 16).replace(/[:T]/g, '')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
