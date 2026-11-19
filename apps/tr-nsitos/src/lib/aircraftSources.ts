import { zite } from 'zitejs/db';

export interface RawPlane {
  icao24: string; callsign: string; country: string; posTime: number;
  lat: number; lon: number; altM: number; velocity: number; track: number; vrate: number;
}

async function fetchTimeout(url: string, ms = 8000, headers?: Record<string, string>) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers }); } finally { clearTimeout(t); }
}

function parseTar1090(j: { now: number; ac?: Record<string, unknown>[] }): { planes: RawPlane[]; time: number } {
  const nowS = j.now / 1000;
  const planes = (j.ac ?? [])
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground' && typeof a.gs === 'number')
    .map((a) => ({
      icao24: String(a.hex),
      callsign: String(a.flight ?? '').trim() || String(a.r ?? a.hex).toUpperCase(),
      country: String(a.t ?? ''),
      posTime: nowS - Number(a.seen_pos ?? 0),
      lat: Number(a.lat), lon: Number(a.lon),
      altM: Number(a.alt_geom ?? a.alt_baro ?? 0) * 0.3048,
      velocity: Number(a.gs) * 0.514444,
      track: Number(a.track ?? a.true_heading ?? 0),
      vrate: (Number(a.geom_rate ?? a.baro_rate ?? 0) * 0.3048) / 60,
    }));
  return { planes, time: nowS };
}

// O saldo do adsb.lol (500 pedidos/24h, janela deslizante) tem de ser partilhado por TODAS as execuções:
// o radar em direto (uma chamada por utilizador a cada poucos segundos) e a recolha agendada. Cada
// execução corre isolada, por isso uma variável em memória não chega — por vezes nem travava a tempo, e o
// saldo esgotava sem aviso a meio do dia. Guardamos o estado numa tabela, lido/escrito a cada chamada.
const KEY = 'adsbLol';
const RESERVE = 40; // pedidos que ficam sempre de fora, para nunca chegar mesmo a 0 sem aviso prévio

interface Budget { day: string; used: number; remaining: number; resetAt: number }

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()); // YYYY-MM-DD
}

async function readBudget(): Promise<{ id: string | null; b: Budget }> {
  const { records } = await zite.apiBudget.findAll({ filter: { key: KEY }, limit: 1 });
  const r = records[0];
  const b: Budget = r && r.day === today()
    ? { day: r.day!, used: r.used ?? 0, remaining: r.remaining ?? 500, resetAt: r.resetAt ? Date.parse(r.resetAt) : 0 }
    : { day: today(), used: 0, remaining: 500, resetAt: 0 };
  return { id: r?.id ?? null, b };
}

async function writeBudget(id: string | null, b: Budget) {
  const record = { key: KEY, day: b.day, used: b.used, remaining: b.remaining, resetAt: b.resetAt ? new Date(b.resetAt).toISOString() : '' };
  if (id) await zite.apiBudget.update({ id, record }); else await zite.apiBudget.create({ record });
}

type LolResult = { ok: { planes: RawPlane[]; time: number; source: string; remaining: number; resetAt: number } } | { skipped: Budget };

async function fromAdsbLol(lat: number, lon: number, radiusKm: number): Promise<LolResult> {
  const { id, b } = await readBudget();
  // Se a janela de 24h já reiniciou (passou o instante indicado por x-ratelimit-reset na última resposta),
  // não sabemos ainda o saldo real: deixamos passar um pedido de sondagem, que traz o valor verdadeiro.
  const windowOver = b.resetAt > 0 && Date.now() > b.resetAt;
  if (!windowOver && b.remaining <= RESERVE) return { skipped: b as Budget };

  const nm = Math.min(250, Math.ceil(radiusKm / 1.852));
  const res = await fetchTimeout(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`);
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
  const resetS = Number(res.headers.get('x-ratelimit-reset') ?? 3600);
  const nb: Budget = {
    day: today(), used: b.used + 1,
    remaining: Number.isFinite(remaining) ? remaining : Math.max(0, b.remaining - 1),
    resetAt: Date.now() + resetS * 1000,
  };
  await writeBudget(id, nb);
  if (res.status === 429) return { skipped: nb };
  if (!res.ok) throw new Error(`adsb.lol respondeu ${res.status}`);
  return { ok: { ...parseTar1090(await res.json()), source: 'adsb.lol', remaining: nb.remaining, resetAt: nb.resetAt } };
}

// adsb.fi não publica cabeçalhos de limite, e a partir da rede de produção do Zite tem respondido 403
// (bloqueio da Cloudflare a este IP, confirmado — no ambiente de build a mesma chamada passa). Mantido
// como tentativa de reserva, de baixo custo, caso esse bloqueio um dia deixe de se aplicar.
let adsbFiPausedUntil = 0;

async function fromAdsbFi(lat: number, lon: number, radiusKm: number) {
  if (Date.now() < adsbFiPausedUntil) return null;
  const km = Math.min(450, Math.round(radiusKm));
  const res = await fetchTimeout(
    `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${km}`,
    8000,
    { 'User-Agent': 'Mozilla/5.0' },
  );
  if (!res.ok) { adsbFiPausedUntil = Date.now() + 300_000; return null; }
  return { ...parseTar1090(await res.json()), source: 'adsb.fi' };
}

/**
 * Obtém os aviões num raio à volta de `home`. Tenta o adsb.lol, cujo saldo diário (partilhado por todos
 * os pedidos desta app, radar em direto incluído) é guardado na tabela Api Budget para nunca o esgotar
 * sem aviso. Se estiver sem saldo, tenta o adsb.fi como reserva (hoje bloqueado pela rede do Zite, mas
 * mantido para o caso de deixar de estar). A OpenSky Network foi retirada: o seu servidor não aceita
 * ligações a partir da rede do Zite, mesmo com credenciais válidas — bloqueio confirmado, não um problema
 * de código ou credenciais.
 */
export async function fetchPlanes(lat: number, lon: number, radiusKm: number): Promise<{ planes: RawPlane[]; time: number; source: string; remaining?: number; resetAt?: number }> {
  const a = await fromAdsbLol(lat, lon, radiusKm);
  if ('ok' in a) return a.ok;
  const b = await fromAdsbFi(lat, lon, radiusKm);
  if (b) return b;
  const e: any = new Error('Sem saldo no adsb.lol e sem reserva disponível (adsb.fi bloqueado ou em pausa)');
  e.budget = a.skipped;
  throw e;
}
