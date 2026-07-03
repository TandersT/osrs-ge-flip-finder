import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import path from 'node:path';
import fs from 'node:fs';
import { config, repoRoot } from './config.js';
import { registerApiRoutes } from './routes.js';

const app = Fastify({ logger: true });

// The items payload is ~1MB of JSON re-polled every minute — compression matters
await app.register(fastifyCompress);

registerApiRoutes(app);

// In production the same process serves the built SPA
const clientDist = path.join(repoRoot, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    setHeaders: (res, filePath) => {
      // Vite content-hashes everything under assets/ -> safe to cache forever;
      // index.html must revalidate so deploys show up immediately
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
