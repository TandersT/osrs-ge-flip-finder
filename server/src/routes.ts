import type { FastifyInstance } from 'fastify';
import type { AppConfig, Timestep } from '@osrs-flip/shared';
import { config } from './config.js';
import { getItems } from './items.js';
import { getLongterm } from './longterm.js';
import { getTimeseries, wikiCache } from './wiki.js';

const TIMESTEPS: ReadonlySet<string> = new Set(['5m', '1h', '6h', '24h']);

export function registerApiRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ ok: true, upstreamCalls: wikiCache.stats() }));

  app.get('/api/config', async (): Promise<AppConfig> => ({
    captureRate: config.captureRate,
    offerOffset: config.offerOffset,
    clientRefreshSeconds: config.clientRefreshSeconds,
    staleAfterSeconds: config.staleAfterSeconds,
  }));

  app.get('/api/items', async (_req, reply) => {
    try {
      return await getItems();
    } catch (err) {
      app.log.error(err, 'items fetch failed with empty cache');
      return reply.code(502).send({ error: 'Upstream price API unavailable' });
    }
  });

  app.get('/api/longterm', async () => getLongterm());

  app.get<{ Querystring: { id?: string; timestep?: string } }>(
    '/api/timeseries',
    async (req, reply) => {
      const id = Number(req.query.id);
      const timestep = req.query.timestep ?? '1h';
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: 'id must be a positive integer' });
      }
      if (!TIMESTEPS.has(timestep)) {
        return reply.code(400).send({ error: `timestep must be one of ${[...TIMESTEPS].join(', ')}` });
      }
      try {
        const hit = await getTimeseries(id, timestep as Timestep);
        return {
          data: hit.value,
          fetchedAt: Math.floor(hit.fetchedAt / 1000),
          upstreamStale: hit.stale,
        };
      } catch (err) {
        app.log.error(err, 'timeseries fetch failed with empty cache');
        return reply.code(502).send({ error: 'Upstream price API unavailable' });
      }
    },
  );
}
