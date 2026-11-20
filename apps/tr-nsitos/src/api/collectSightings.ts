import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { collectOnce } from '../lib/collector';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Recolha em segundo plano das observações de aviões para as estatísticas da página Rotas.
// O agendamento do Zite só tem granularidade ao minuto, por isso, para recolher 2x por minuto, esta
// execução (disparada 1x por minuto) corre a recolha duas vezes, com uma pausa de 30 s entre elas —
// ~31 s de execução no total, bem dentro do minuto até à próxima chamada (overlapPolicy 'skip' evita
// sobreposição mesmo assim). Só quando o Sol ou a Lua estão acima da elevação mínima, e pára sozinha a
// 1 Dez 2026 (2 semanas).
export default createEndpoint({
  description: 'Recolhe em segundo plano os aviões que podem alinhar com o Sol/Lua (agendado, 2x/min)',
  inputSchema: z.object({}),
  outputSchema: z.object({ results: z.array(z.object({ owner: z.string(), seen: z.number(), saved: z.number(), source: z.string().optional(), skipped: z.string().optional() })) }),
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'minutely', interval: 1 },
    endPolicy: { type: 'onDate', endAt: '2026-12-01T23:59:00Z' },
    overlapPolicy: 'skip',
    timezone: 'Europe/Lisbon',
  },
  execute: async () => {
    const results = await collectOnce();
    await sleep(30_000);
    results.push(...(await collectOnce()));
    return { results };
  },
});
