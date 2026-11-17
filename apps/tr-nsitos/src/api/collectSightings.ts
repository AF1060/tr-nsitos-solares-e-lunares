import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { collectOnce } from '../lib/collector';

// Recolha em segundo plano das observações de aviões para as estatísticas da página Rotas.
// A cada 15 min (máx. 96 pedidos/dia ao adsb.lol, que permite 500), só quando o Sol ou a Lua estão acima
// da elevação mínima, e pára sozinha a 1 Dez 2026 (2 semanas).
export default createEndpoint({
  description: 'Recolhe em segundo plano os aviões que podem alinhar com o Sol/Lua (agendado, 15 min)',
  inputSchema: z.object({}),
  outputSchema: z.object({ results: z.array(z.object({ owner: z.string(), seen: z.number(), saved: z.number(), skipped: z.string().optional() })) }),
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'minutely', interval: 15 },
    endPolicy: { type: 'onDate', endAt: '2026-12-01T23:59:00Z' },
    overlapPolicy: 'skip',
    timezone: 'Europe/Lisbon',
  },
  execute: async () => ({ results: await collectOnce() }),
});
