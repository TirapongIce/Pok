import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

// Explicit initialization step for a new team-test database; does not seed users.
try {
  if (!pool) throw new Error('Configure DB_HOST, DB_USER and DB_NAME first');
  if (process.env.DB_SCHEMA && process.env.DB_SCHEMA !== 'lotto_demo') throw new Error('Base schema initialization requires DB_SCHEMA=lotto_demo');
  const sql = await readFile(new URL('../schema_postgres.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Team-test database schema ready');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
