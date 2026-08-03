import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const hasRequiredConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
let pool = null;

if (hasRequiredConfig) {
  const sslEnabled = String(process.env.DB_SSL || "false").toLowerCase() === "true";
  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
  });
  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client", err);
  });
  pool.on("connect", (client) => {
    const schema = process.env.DB_SCHEMA || "lotto_demo";
    client.query(`SET search_path TO ${schema}, public`).catch((err) => {
      console.error("[db] Failed to set search_path:", err.message);
    });
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
