import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const validPassword = (value) => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
export const isLegacyHash = (value) => /^[a-f\d]{64}$/i.test(String(value).trim());
export const hashPassword = (password) => {
  if (!validPassword(password)) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์');
  return bcrypt.hash(password, 12);
};
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 72 || !stored) return false;
  const hash = String(stored).trim();
  if (isLegacyHash(hash)) {
    const candidate = crypto.createHash('sha256').update(password).digest();
    return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
  }
  return bcrypt.compare(password, hash);
}
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

export class SecurityStore {
  constructor(pool, { ttlMs = 8 * 60 * 60 * 1000, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
    this.pool = pool;
    this.ttlMs = ttlMs;
    this.windowMs = windowMs;
    this.now = now;
    this.sessions = new Map();
    this.attempts = new Map();
  }
  async init() {
    if (!this.pool) return;
    await this.pool.query('ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255)');
    await this.pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL)`);
    await this.pool.query('CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at)');
    await this.pool.query(`CREATE TABLE IF NOT EXISTS auth_attempts (
      key_hash CHAR(64) PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`);
  }
  async create(profile) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    if (this.pool) {
      await this.pool.query('INSERT INTO auth_sessions(token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [digest(token), profile.userId, new Date(expiresAt)]);
    } else this.sessions.set(digest(token), { ...profile, expiresAt });
    return token;
  }
  async get(token) {
    if (typeof token !== 'string' || !/^[a-f\d]{64}$/.test(token)) return null;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT u.id AS "userId", u.username, u.role FROM auth_sessions s
        JOIN users u ON u.id = s.user_id WHERE token_hash = $1 AND expires_at > $2`, [digest(token), new Date(this.now())]);
      return rows[0] || null;
    }
    const session = this.sessions.get(digest(token));
    if (!session || session.expiresAt <= this.now()) { this.sessions.delete(digest(token)); return null; }
    return session;
  }
  async delete(token) {
    if (typeof token !== 'string') return;
    if (this.pool) await this.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [digest(token)]);
    else this.sessions.delete(digest(token));
  }
  async revokeUser(userId) {
    if (this.pool) await this.pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
    else for (const [key, value] of this.sessions) if (value.userId === userId) this.sessions.delete(key);
  }
  async attempt(key, limit) {
    const keyHash = digest(key);
    const now = this.now();
    let entry;
    if (this.pool) {
      const { rows } = await this.pool.query(`INSERT INTO auth_attempts(key_hash,count,expires_at) VALUES ($1,1,$2)
        ON CONFLICT(key_hash) DO UPDATE SET
        count=CASE WHEN auth_attempts.expires_at <= $3 THEN 1 ELSE auth_attempts.count+1 END,
        expires_at=CASE WHEN auth_attempts.expires_at <= $3 THEN EXCLUDED.expires_at ELSE auth_attempts.expires_at END
        RETURNING count, expires_at AS "expiresAt"`, [keyHash, new Date(now + this.windowMs), new Date(now)]);
      entry = { count: rows[0].count, expiresAt: new Date(rows[0].expiresAt).getTime() };
    } else {
      entry = this.attempts.get(keyHash);
      if (!entry || entry.expiresAt <= now) entry = { count: 0, expiresAt: now + this.windowMs };
      entry.count++;
      this.attempts.set(keyHash, entry);
    }
    return entry.count > limit ? Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)) : 0;
  }
  async cleanup() {
    if (this.pool) {
      await this.pool.query('DELETE FROM auth_sessions WHERE expires_at <= $1', [new Date(this.now())]);
      await this.pool.query('DELETE FROM auth_attempts WHERE expires_at <= $1', [new Date(this.now())]);
    } else {
      for (const map of [this.sessions, this.attempts]) for (const [key, value] of map) if (value.expiresAt <= this.now()) map.delete(key);
    }
  }
}
