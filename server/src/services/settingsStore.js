export class SettingsStore {
  constructor(pool) { this.pool = pool; }
  async init() {
    if (this.pool) await this.pool.query('CREATE TABLE IF NOT EXISTS runtime_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL)');
  }
  async save(key, value) {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO runtime_settings(key,value) VALUES ($1,$2)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`, [key, JSON.stringify(value)]);
      if (key.startsWith('lottery:')) {
        await client.query('UPDATE lotteries SET status=$2, open_time=$3, close_time=$4 WHERE code=$1', [key.slice(8), value.status, value.openTime, value.closeTime]);
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }
  async load(lotteries, settings) {
    if (!this.pool) return;
    const { rows } = await this.pool.query('SELECT key,value FROM runtime_settings');
    for (const row of rows) {
      if (row.key === 'app') Object.assign(settings, row.value);
      if (row.key.startsWith('lottery:')) {
        const id = row.key.slice(8);
        const lottery = lotteries.find(item => item.id === id);
        if (lottery) Object.assign(lottery, row.value);
        else lotteries.push(row.value);
      }
    }
  }
}
