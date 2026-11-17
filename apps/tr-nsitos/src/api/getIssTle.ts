import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';

let cache: { line1: string; line2: string; fetchedAt: number } | null = null;

async function get(url: string) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 6000);
  try {
    const res = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Transitos/1.0' } });
    if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
    return await res.text();
  } finally { clearTimeout(id); }
}

const fromText = (txt: string) => {
  const lines = txt.split(/\r?\n/).map((l) => l.trim());
  return { line1: lines.find((l) => l.startsWith('1 ')), line2: lines.find((l) => l.startsWith('2 ')) };
};

const sources: (() => Promise<{ line1?: string; line2?: string }>)[] = [
  async () => fromText(await get('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE')),
  async () => { const j = JSON.parse(await get('https://tle.ivanstanojevic.me/api/tle/25544')); return { line1: j.line1, line2: j.line2 }; },
  async () => { const j = JSON.parse(await get('https://api.wheretheiss.at/v1/satellites/25544/tles')); return { line1: j.line1, line2: j.line2 }; },
];

export default createEndpoint({
  description: 'Obtém os dados orbitais (TLE) atuais da ISS (CelesTrak, com fontes alternativas)',
  inputSchema: z.object({}),
  outputSchema: z.object({ line1: z.string(), line2: z.string(), fetchedAt: z.number() }),
  execute: async () => {
    if (cache && Date.now() - cache.fetchedAt < 3 * 3600_000) return cache;
    for (const s of sources) {
      try {
        const { line1, line2 } = await s();
        if (line1?.startsWith('1 ') && line2?.startsWith('2 ')) {
          cache = { line1, line2, fetchedAt: Date.now() };
          return cache;
        }
      } catch (e) { console.error('Fonte TLE falhou', e); }
    }
    if (cache) return cache;
    throw new Error('Nenhuma fonte de TLE respondeu');
  },
});
