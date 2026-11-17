let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

export function beep(freq = 880, dur = 0.12, vol = 0.35) {
  try {
    const a = audio();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export function alertChime() {
  [660, 880, 1100].forEach((f, i) => setTimeout(() => beep(f, 0.18), i * 220));
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-PT';
  const v = speechSynthesis.getVoices().find((x) => x.lang === 'pt-PT') ?? speechSynthesis.getVoices().find((x) => x.lang.startsWith('pt'));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: title });
  } catch {
    /* some mobile browsers only allow SW notifications */
  }
}

export async function requestAlarmPermissions() {
  audio();
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
