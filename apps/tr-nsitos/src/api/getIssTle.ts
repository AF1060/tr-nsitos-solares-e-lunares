import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';

let cache: { line1: string; line2: string; fetchedAt: number } | null = null;

export default createEndpoint({
  description: 'Obtém os dados orbitais (TLE) atuais da ISS a partir da CelesTrak',
  inputSchema: z.object({}),
  outputSchema: z.object({ line1: z.string(), line2: z.string(), fetchedAt: z.number() }),
  execute: async () => {
    if (cache && Date.now() - cache.fetchedAt < 3 * 3600_000) return cache;
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
    if (!res.ok) throw new Error(`CelesTrak respondeu ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.trim());
    const line1 = lines.find((l) => l.startsWith('1 '));
    const line2 = lines.find((l) => l.startsWith('2 '));
    if (!line1 || !line2) throw new Error('TLE da ISS inválido');
    cache = { line1, line2, fetchedAt: Date.now() };
    return cache;
  },
});
