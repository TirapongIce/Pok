import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import pg from 'pg';

const enabled = process.env.RUN_DB_TESTS === 'true';
test('isolated PostgreSQL API regressions', { skip: !enabled, timeout: 120000 }, async t => {
  assert.match(process.env.DB_NAME || '', /_test$/, 'Use a dedicated database ending in _test');
  const pool = new pg.Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '-c search_path=lotto_demo,public' });
  const processes = new Set();
  const basePort = Number(process.env.TEST_PORT || 4410);
  const adminPassword = 'IntegrationAdmin123!';
  const adminUsername = `admin_${Date.now()}`;
  const base = `http://127.0.0.1:${basePort}`;
  async function call(path, { token, body, method = body === undefined ? 'GET' : 'POST', origin = base } = {}) {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-session-token': token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  async function start(port) {
    const child = spawn(process.execPath, ['src/index.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: 'production', PORT: String(port), SUPERADMIN_USERNAME: adminUsername, SUPERADMIN_PASSWORD: adminPassword, SUPERADMIN_RESET_PASSWORD: 'false', SEED_DEMO_DATA: 'false', THAI_SYNC_AUTO: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    processes.add(child);
    let logs = '';
    child.stdout.on('data', d => logs += d);
    child.stderr.on('data', d => logs += d);
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await call('/api/health/db', { origin: `http://127.0.0.1:${port}` })).status === 200) return child; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Server startup timed out: ' + logs);
  }
  async function stop(child) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; processes.delete(child); }
  t.after(async () => { for (const child of processes) await stop(child); await pool.end(); });
  let server = await start(basePort);
  const admin = (await call('/api/auth/login', { body: { username: adminUsername, password: adminPassword } })).body.token;
  assert.ok(admin);
  const username = `member_${Date.now()}`;
  const password = 'MemberPassword123!';
  const user = await call('/api/admin/users', { token: admin, body: { username, password, creditLimit: 100, role: 'agent' } });
  assert.equal(user.status, 201);
  let token = (await call('/api/auth/login', { body: { username, password } })).body.token;
  assert.ok(token);
  await t.test('legacy password migration, hash replay rejection, and access control', async () => {
    assert.equal((await call('/api/admin/members')).status, 401);
    assert.equal((await call('/api/admin/members', { token })).status, 403);
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [legacy, user.body.id]);
    assert.equal((await call('/api/auth/login', { body: { username, password: legacy } })).status, 401);
    token = (await call('/api/auth/login', { body: { username, password } })).body.token;
    assert.ok(token);
    assert.match((await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.body.id])).rows[0].password_hash, /^\$2/);
  });
  await t.test('settings and sessions survive restart and work across instances', async () => {
    const saved = await call('/api/admin/lotteries/th-lottery/status', { token: admin, body: { status: 'closed', minBet: 15 } });
    assert.equal(saved.status, 200);
    await stop(server);
    server = await start(basePort);
    assert.equal((await call('/api/profile', { token })).status, 200);
    const lottery = await call('/api/lotteries/th-lottery');
    assert.equal(lottery.body.status, 'closed');
    assert.equal(lottery.body.minBet, 15);
    const other = await start(basePort + 1);
    assert.equal((await call('/api/profile', { token, origin: `http://127.0.0.1:${basePort + 1}` })).status, 200);
    await stop(other);
    await call('/api/admin/lotteries/th-lottery/status', { token: admin, body: { status: 'open', minBet: 10 } });
  });
  await t.test('simultaneous withdrawals cannot overdraw and refunds happen once', async () => {
    const attempts = await Promise.all(Array.from({ length: 5 }, () => call('/api/wallet/withdraw', { token, body: { amount: 30 } })));
    const accepted = attempts.filter(r => r.status === 201);
    assert.equal(accepted.length, 3);
    assert.equal(Number((await pool.query('SELECT credit_limit FROM users WHERE id=$1', [user.body.id])).rows[0].credit_limit), 10);
    const id = accepted[0].body.id;
    const decisions = await Promise.all(Array.from({ length: 3 }, () => call(`/api/admin/transactions/${id}/reject`, { token: admin, body: {} })));
    assert.equal(decisions.filter(r => r.status === 200).length, 1);
    assert.equal(decisions.filter(r => r.status === 409).length, 2);
    assert.equal((await call(`/api/admin/transactions/${id}/approve`, { token: admin, body: {} })).status, 409);
    assert.equal(Number((await pool.query('SELECT credit_limit FROM users WHERE id=$1', [user.body.id])).rows[0].credit_limit), 40);
    const deposit = await call('/api/wallet/deposit', { token, body: { amount: 25 } });
    const approvals = await Promise.all(Array.from({ length: 3 }, () => call(`/api/admin/transactions/${deposit.body.id}/approve`, { token: admin, body: {} })));
    assert.equal(approvals.filter(r => r.status === 200).length, 1);
    assert.equal(Number((await pool.query('SELECT credit_limit FROM users WHERE id=$1', [user.body.id])).rows[0].credit_limit), 65);
    const direct = await call(`/api/admin/users/${user.body.id}/withdraw`, { token: admin, body: { amount: 15 } });
    assert.equal(direct.status, 200);
    assert.equal(direct.body.creditLimit, 50);
    assert.equal(direct.body.creditUsed, 0);
    assert.equal((await call(`/api/admin/users/${user.body.id}/withdraw`, { token: admin, body: { amount: 51 } })).status, 400);
  });
  await t.test('notification ownership, upload limit, and non-finite amount validation', async () => {
    const { rows } = await pool.query("INSERT INTO notifications(user_id,type,title,message) VALUES ($1,'test','test','test') RETURNING id", [(await pool.query('SELECT id FROM users WHERE username=$1', [adminUsername])).rows[0].id]);
    await call(`/api/notifications/${rows[0].id}/read`, { token, body: {} });
    assert.equal((await pool.query('SELECT read FROM notifications WHERE id=$1', [rows[0].id])).rows[0].read, false);
    assert.equal((await call('/api/wallet/withdraw', { token, body: { amount: 'Infinity' } })).status, 400);
    const form = new FormData(); form.append('amount', '1'); form.append('slip', new Blob([new Uint8Array(6 * 1024 * 1024)]), 'large.png');
    assert.equal((await fetch(base + '/api/wallet/deposit', { method: 'POST', headers: { 'x-session-token': token }, body: form })).status, 413);
  });
  await t.test('password change requires old password and revokes every session', async () => {
    const nextPassword = 'ChangedPassword123!';
    assert.equal((await call('/api/profile/password', { token, body: { password: nextPassword, currentPassword: 'wrong' } })).status, 403);
    assert.equal((await call('/api/profile/password', { token, body: { password: nextPassword, currentPassword: password } })).status, 200);
    assert.equal((await call('/api/profile', { token })).status, 401);
    assert.equal((await call('/api/auth/login', { body: { username, password } })).status, 401);
    const next = await call('/api/auth/login', { body: { username, password: nextPassword } });
    assert.equal(next.status, 200);
    await pool.query('UPDATE auth_sessions SET expires_at=now()-interval \'1 second\' WHERE user_id=$1', [user.body.id]);
    assert.equal((await call('/api/profile', { token: next.body.token })).status, 401);
  });
  await t.test('login throttling is persisted and returns Retry-After', async () => {
    const unknown = `missing_${Date.now()}`;
    for (let i = 0; i < 10; i++) assert.equal((await call('/api/auth/login', { body: { username: unknown, password } })).status, 401);
    await stop(server); server = await start(basePort);
    const blocked = await call('/api/auth/login', { body: { username: unknown, password } });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });
});
