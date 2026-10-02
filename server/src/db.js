import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";

dotenv.config();

const { Pool } = pg;
// คืนค่า DATE เป็นสตริง "YYYY-MM-DD" ตรงๆ ไม่แปลงเป็น Date (กันวันที่งวดเลื่อนตาม timezone ของเครื่อง)
pg.types.setTypeParser(1082, (value) => value);

const hasRequiredConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
let pool = null;

if (hasRequiredConfig) {
  const sslEnabled = String(process.env.DB_SSL || "false").toLowerCase() === "true";
  const schema = process.env.DB_SCHEMA || "lotto_demo";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("Invalid DB_SCHEMA");
  pool = new Pool({
    options: `-c search_path=${schema},public`,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslEnabled ? { rejectUnauthorized: true, ...(process.env.DB_SSL_CA ? { ca: readFileSync(process.env.DB_SSL_CA, "utf8") } : {}) } : undefined
  });
  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client", err);
  });

} else {
  console.warn("[db] Database configuration incomplete. Skipping pool initialization.");
}

export { pool };

export async function testConnection() {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  await pool.query("SELECT 1");
}

export function isDbEnabled() {
  return Boolean(pool);
}
