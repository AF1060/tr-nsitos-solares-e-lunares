// Obtém os aviões próximos diretamente do browser do utilizador, em vez de passar pelo backend da
// Zite. O backend partilha o seu IP de saída com milhares de outras apps, o que esgota ou bloqueia o
// acesso a APIs como a OpenSky ou o adsb.lol; o browser usa o IP residencial/móvel do próprio
// utilizador, que não sofre esse problema.
//
// Se o pedido direto falhar (rede do utilizador a bloquear, CORS retirado no lado do servidor,
// APIs em baixo, etc.), cai-se para o endpoint do backend (getAircraft), que mantém a lógica de
// orçamento partilhado e o adsb.fi como reserva. Isto garante que o radar continua a funcionar mesmo
// que o pedido direto não seja possível nalgum browser ou rede.
import { fetchTimeout, parseTar1090, type RawPlane } from './aircraftParse';
import { getAircraft } from 'zitejs/api';

export type { RawPlane };

export interface AircraftResult {
  planes: RawPlane[];
  time: number;
  source: string;
  remaining: number | null;
  resetAt: number | null;
}

// Nunca repetir o pedido direto mais depressa do que isto, mesmo que algo chame a função com mais
// frequência do que o intervalo normal do radar (POLL_MS, em AircraftContext.tsx).
const MIN_INTERVAL_MS = 2500;
let lastDirectAttempt = 0;

async function fromAdsbLolBrowser(lat: number, lon: number, radiusKm: number): Promise<AircraftResult | null> {
  const nm = Math.min(250, Math.ceil(radiusKm / 1.852));
  const res = await fetchTimeout(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`);
  if (!res.ok) return null;
  const { planes, time } = parseTar1090(await res.json());
  return { planes, time, source: 'adsb.lol (browser)', remaining: null, resetAt: null };
}

async function fromAdsbFiBrowser(lat: number, lon: number, radiusKm: number): Promise<AircraftResult | null> {
  const km = Math.min(450, Math.round(radiusKm));
  const res = await fetchTimeout(
    `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${km}`,
    8000,
    { 'User-Agent': 'Mozilla/5.0' },
  );
  if (!res.ok) return null;
  const { planes, time } = parseTar1090(await res.json());
  return { planes, time, source: 'adsb.fi (browser)', remaining: null, resetAt: null };
}

/**
 * Obtém os aviões num raio à volta de `home`, tentando primeiro um pedido direto do browser
 * (adsb.lol, depois adsb.fi como reserva de baixo custo) e só recorrendo ao backend
 * (getAircraft) se ambos falharem — por exemplo, se a rede do utilizador bloquear o pedido ou se
 * o CORS deixar de estar disponível num desses serviços.
 */
export async function fetchPlanes(lat: number, lon: number, radiusKm: number): Promise<AircraftResult> {
  // Protege contra chamadas em rajada (ex.: re-render em sequência), mesmo com o intervalo normal
  // do radar já bem acima disto.
  const now = Date.now();
  if (now - lastDirectAttempt >= MIN_INTERVAL_MS) {
    lastDirectAttempt = now;
    try {
      const lol = await fromAdsbLolBrowser(lat, lon, radiusKm);
      if (lol) return lol;
    } catch {
      // rede/CORS indisponível a partir do browser — tenta a reserva, depois o backend
    }
    try {
      const fi = await fromAdsbFiBrowser(lat, lon, radiusKm);
      if (fi) return fi;
    } catch {
      // idem
    }
  }

  // Reserva final: backend da Zite (orçamento partilhado do adsb.lol + adsb.fi).
  const r = await getAircraft({ lat, lon, radiusKm });
  return { ...r, remaining: r.remaining ?? null, resetAt: r.resetAt ?? null };
}
