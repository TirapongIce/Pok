import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Host the built UI on the same origin as /api, avoiding a separate frontend URL.
export function mountClient(app) {
  if (process.env.SERVE_CLIENT !== 'true') return;
  const directory = fileURLToPath(new URL('../../../client/dist/', import.meta.url));
  const index = fileURLToPath(new URL('../../../client/dist/index.html', import.meta.url));
  if (!existsSync(index)) throw new Error('Client build missing: run npm run build --prefix client');
  app.use(express.static(directory, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
