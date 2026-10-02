import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SecurityStore, hashPassword, verifyPassword, validPassword } from '../src/services/security.js';

test('password hashing uses distinct salts and legacy hashes cannot be replayed', async () => {
  const password = 'TestPassword123!';
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(await verifyPassword(legacy, legacy), false);
  assert.equal(validPassword('ก'.repeat(25)), false);
  assert.equal(await verifyPassword({}, a), false);
});

test('sessions expire, are revoked, and throttles reset after the window', async () => {
  let now = 1000;
  const store = new SecurityStore(null, { now: () => now, ttlMs: 100, windowMs: 200 });
  const token = await store.create({ userId: 1, username: 'test' });
  assert.equal((await store.get(token)).username, 'test');
  assert.equal(store.sessions.has(token), false);
  now += 101;
  assert.equal(await store.get(token), null);
  const second = await store.create({ userId: 1 });
  await store.revokeUser(1);
  assert.equal(await store.get(second), null);
  assert.equal(await store.attempt('user:test', 2), 0);
  assert.equal(await store.attempt('user:test', 2), 0);
  assert.ok(await store.attempt('user:test', 2));
  now += 201;
  assert.equal(await store.attempt('user:test', 2), 0);
});
