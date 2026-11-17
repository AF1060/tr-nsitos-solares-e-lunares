import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Remove o alarme de uma passagem',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const r = await zite.plannedPasses.findOne({ id: input.id });
    const owner = Array.isArray(r?.owner) ? r?.owner : [r?.owner];
    if (!r || !owner.includes(context.user.id)) throw new Error('Passagem não encontrada');
    await zite.plannedPasses.delete({ id: input.id });
    return { success: true };
  },
});
