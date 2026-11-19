export interface RawPlane {
  icao24: string; callsign: string; country: string; posTime: number;
  lat: number; lon: number; altM: number; velocity: number; track: number; vrate: number;
}

async function fetchTimeout(url: string, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
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

// O adsb.lol publica um limite de 500 pedidos/dia (cabeçalhos x-ratelimit-*) e deixamos sempre uma
// reserva, partilhada por todos os observadores desta app, para o radar em direto nunca ficar sem saldo
// por causa da recolha em segundo plano. Guardado em memória do processo: reinicia a cada deploy.
const RESERVE = 200;
let adsbLolPausedUntil = 0;

async function fromAdsbLol(lat: number, lon: number, radiusKm: number) {
  if (Date.now() < adsbLolPausedUntil) return null;
  const nm = Math.min(250, Math.ceil(radiusKm / 1.852));
  const res = await fetchTimeout(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`);
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
  const resetS = Number(res.headers.get('x-ratelimit-reset') ?? 3600);
  if (res.status === 429 || (Number.isFinite(remaining) && remaining < RESERVE)) adsbLolPausedUntil = Date.now() + resetS * 1000;
  if (res.status === 429) return null;
  if (!res.ok) throw new Error(`adsb.lol respondeu ${res.status}`);
  return { ...parseTar1090(await res.json()), source: 'adsb.lol' };
}

// adsb.fi não publica cabeçalhos de limite; em caso de erro ou 429, afasta-se por 5 min antes de tentar outra vez.
let adsbFiPausedUntil = 0;

async function fromAdsbFi(lat: number, lon: number, radiusKm: number) {
  if (Date.now() < adsbFiPausedUntil) return null;
  const km = Math.min(450, Math.round(radiusKm));
  const res = await fetchTimeout(`https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${km}`);
  if (res.status === 429) { adsbFiPausedUntil = Date.now() + 300_000; return null; }
  if (!res.ok) throw new Error(`adsb.fi respondeu ${res.status}`);
  return { ...parseTar1090(await res.json()), source: 'adsb.fi' };
}

/**
 * Obtém os aviões num raio à volta de `home`, tentando o adsb.lol primeiro (reservando saldo para o
 * radar) e recorrendo ao adsb.fi se aquele estiver em pausa ou falhar. A OpenSky Network foi retirada:
 * o seu servidor não aceita ligações a partir da rede do Zite (TCP fica em timeout, mesmo com credenciais
 * válidas), o que é um bloqueio conhecido a IPs de centros de dados/nuvem e não um problema do código ou
 * das credenciais. Se isso mudar, pode voltar a ser adicionada aqui como mais uma fonte.
 */
export async function fetchPlanes(lat: number, lon: number, radiusKm: number): Promise<{ planes: RawPlane[]; time: number; source: string }> {
  try {
    const a = await fromAdsbLol(lat, lon, radiusKm);
    if (a) return a;
  } catch { /* tenta a fonte seguinte */ }
  const b = await fromAdsbFi(lat, lon, radiusKm);
  if (b) return b;
  throw new Error('Sem resposta do adsb.lol nem do adsb.fi (limite diário ou falha de ambos)');
}
