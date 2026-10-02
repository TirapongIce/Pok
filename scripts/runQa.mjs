// Runs the existing full-loop suite against local synthetic result fixtures.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
if (!process.env.DB_NAME?.endsWith('_test') || !process.env.PSQL) throw new Error('QA requires DB_NAME ending in _test and PSQL for the isolated database');
const children = [];
function start(script, env) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child); return child;
}
async function ready(url) {
  for (let i = 0; i < 150; i++) {
    if (children.some(c => c.exitCode !== null)) throw new Error('QA service exited');
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('QA service did not become ready');
}
try {
  start('scripts/mockGlo.mjs', {});
  await ready('http://127.0.0.1:4499/lottery/getLatestLottery');
  start('server/src/index.js', { PORT: '4402', NODE_ENV: 'production', SUPERADMIN_PASSWORD: 'QaAdminPassword123!', SUPERADMIN_USERNAME: 'qa_admin', SEED_DEMO_DATA: 'false', THAI_SYNC_AUTO: 'true', THAI_SYNC_INTERVAL_MS: '1000', GLO_API_BASE: 'http://127.0.0.1:4499' });
  await ready('http://127.0.0.1:4402/api/health/db');
  const runner = start('scripts/qaFullLoop.mjs', { BASE: 'http://127.0.0.1:4402', HUAY_SUPERADMIN_USER: 'qa_admin', HUAY_SUPERADMIN_PASSWORD: 'QaAdminPassword123!' });
  const [code] = await once(runner, 'exit');
  process.exitCode = code || 0;
} finally {
  await Promise.all(children.filter(c => c.exitCode === null).map(async c => { const exit = once(c, 'exit'); c.kill(); await exit; }));
}
