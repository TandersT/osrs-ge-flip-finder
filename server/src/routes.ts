import type { FastifyInstance } from 'fastify';
import type { AppConfig, DealsResponse, Timestep } from '@osrs-flip/shared';
import { buildRows, computeMethodRows } from '@osrs-flip/shared';
import { config } from './config.js';
import { getDivergence } from './divergence.js';
import { getItems } from './items.js';
import { getLongterm } from './longterm.js';
import { getPatchDetail, getPatches, getUpcoming } from './patches.js';
import { rankDeals } from './score.js';
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

  app.get('/api/divergence', async () => getDivergence());

  // Patch Impact (premium page; enforcement is client-side until payments exist)
  app.get('/api/patches', async () => getPatches());

  app.get('/api/patches/upcoming', async () => getUpcoming());

  app.get<{ Params: { pageid: string } }>('/api/patches/:pageid', async (req, reply) => {
    const pageid = Number(req.params.pageid);
    if (!Number.isInteger(pageid) || pageid <= 0) {
      return reply.code(400).send({ error: 'pageid must be a positive integer' });
    }
    const detail = getPatchDetail(pageid);
    if (detail === null) {
      return reply.code(404).send({ error: 'Unknown patch (or analysis still building)' });
    }
    return detail;
  });

  // The Deal Score is computed HERE and only the result leaves the process —
  // the formula is a trade secret (see server/src/score.ts).
  app.get('/api/deals', async (_req, reply): Promise<DealsResponse | void> => {
    try {
      const { items } = await getItems();
      const appConfig: AppConfig = {
        captureRate: config.captureRate,
        offerOffset: config.offerOffset,
        clientRefreshSeconds: config.clientRefreshSeconds,
        staleAfterSeconds: config.staleAfterSeconds,
      };
      const nowSec = Math.floor(Date.now() / 1000);
      const flips = buildRows(items, appConfig, nowSec);
      const methods = computeMethodRows(items, appConfig);
      return { deals: rankDeals(flips, methods), scoredAt: nowSec };
    } catch (err) {
      app.log.error(err, 'deals scoring failed');
      return reply.code(502).send({ error: 'Upstream price API unavailable' });
    }
  });

  // Official OSRS hiscores proxy (no CORS upstream): validated + cached 10 min.
  app.get<{ Querystring: { player?: string } }>('/api/hiscores', async (req, reply) => {
    const player = (req.query.player ?? '').trim();
    if (!/^[\w\- ]{1,12}$/.test(player)) {
      return reply.code(400).send({ error: 'player must be 1-12 word characters' });
    }
    try {
      const hit = await wikiCache.get(
        `hiscores:${player.toLowerCase()}`,
        10 * 60 * 1000,
        async () => {
          const res = await fetch(
            `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(player)}`,
            { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(15_000) },
          );
          if (res.status === 404) return { notFound: true as const };
          if (!res.ok) throw new Error(`hiscores responded ${res.status}`);
          const body = (await res.json()) as {
            name: string;
            skills: { name: string; level: number }[];
          };
          const levels: Record<string, number> = {};
          for (const s of body.skills) {
            if (s.name !== 'Overall') levels[s.name] = Math.max(1, s.level);
          }
          return { notFound: false as const, name: body.name, levels };
        },
      );
      if (hit.value.notFound) {
        return reply.code(404).send({ error: 'Player not found on the hiscores' });
      }
      return { name: hit.value.name, levels: hit.value.levels };
    } catch (err) {
      app.log.error(err, 'hiscores fetch failed');
      return reply.code(502).send({ error: 'Hiscores unavailable' });
    }
  });

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
