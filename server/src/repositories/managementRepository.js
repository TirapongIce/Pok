import { pool, isDbEnabled } from "../db.js";

let supportsTicketPromotionColumn = true;
let supportsTicketDrawDateColumn = true;
let supportsLedgerPromotionColumn = true;
let supportsAdvancedNumberRestrictionColumns = true;
let supportsTransactionTable = true;
let supportsChatTables = true;
let supportsPurchaseLogRateColumn = true;
let supportsPurchaseLogStatusColumn = true;
let ensuredPurchaseLogColumns = false;
let supportsPurchaseLogPaidColumn = true;
let supportsPurchaseLogDrawDateColumn = true;
let supportsAuditLogTable = true;

const SCHEMA_UPGRADES = [
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS payout_rate NUMERIC(12,2)",
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20)",
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE",
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(14,2)",
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP",
  "ALTER TABLE purchase_logs ADD COLUMN IF NOT EXISTS draw_date DATE",
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draw_date DATE",
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS promotion_code VARCHAR(50)",
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(14,2) DEFAULT 0",
  "ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS group_name VARCHAR(100)",
  "ALTER TYPE lottery_kind ADD VALUE IF NOT EXISTS 'viet'",
  "ALTER TYPE lottery_kind ADD VALUE IF NOT EXISTS 'international'",
  "CREATE INDEX IF NOT EXISTS idx_purchase_logs_draw_number ON purchase_logs(lottery_code, draw_date, bet_type, numbers)"
];

// migration แบบ idempotent รันตอนเริ่ม server (ทุกคำสั่งใช้ IF NOT EXISTS)
export async function ensureSchemaUpgrades() {
  if (ensuredPurchaseLogColumns || !pool) return;
  ensuredPurchaseLogColumns = true;
  for (const sql of SCHEMA_UPGRADES) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (!isMissingRelation(err)) console.warn(`[db] schema upgrade skipped (${sql}):`, err.message);
    }
  }
}

async function ensurePurchaseLogOptionalColumns() {
  await ensureSchemaUpgrades();
}

function isMissingRelation(err) {
  return err?.code === "42P01";
}

function isMissingColumn(err) {
  return err?.code === "42703";
}

function chatUnavailableError() {
  const err = new Error("CHAT_TABLE_UNAVAILABLE");
  err.code = "CHAT_TABLE_UNAVAILABLE";
  return err;
}

function transactionsUnavailableError() {
  const err = new Error("TRANSACTIONS_UNAVAILABLE");
  err.code = "TRANSACTIONS_UNAVAILABLE";
  return err;
}

function auditLogsUnavailableError() {
  const err = new Error("AUDIT_LOG_UNAVAILABLE");
  err.code = "AUDIT_LOG_UNAVAILABLE";
  return err;
}

export function hasDatabase() {
  return isDbEnabled();
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    creditLimit: Number(row.credit_limit ?? 0),
    creditUsed: Number(row.credit_used ?? 0),
    createdAt: row.created_at
  };
}

function normalizeNumberList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // ignore parse failure
    }
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

async function fetchUserIdByUsername(username) {
  if (!pool) return null;
  const { rows } = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
  return rows.length ? rows[0].id : null;
}

export async function findUserWithSecret(username) {
  if (!pool) return null;
  const { rows } = await pool.query(
    "SELECT id, username, role, password_hash, credit_limit, credit_used FROM users WHERE username = $1 LIMIT 1",
    [username]
  );
  return rows.length ? rows[0] : null;
}

export async function listUsers() {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query(
    "SELECT id, username, role, credit_limit, credit_used, created_at FROM users ORDER BY created_at DESC"
  );
  return rows.map(mapUserRow);
}

export async function fetchCreditSummary() {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int as total_members, SUM(credit_limit) as total_limit, SUM(credit_used) as total_used FROM users"
  );
  const row = rows?.[0] ?? {};
  const creditLimit = Number(row.total_limit ?? 0);
  const creditUsed = Number(row.total_used ?? 0);
  return {
    totalMembers: Number(row.total_members ?? 0),
    creditLimit,
    creditUsed,
    creditAvailable: creditLimit - creditUsed
  };
}

export async function createUserAccount({ username, passwordHash, role = "agent", creditLimit = 0 }) {
  if (!pool) throw new Error("Database not configured");
  const resolvedRole = role === "user" ? "agent" : role;
  const { rows } = await pool.query(
    "INSERT INTO users (username, password_hash, role, credit_limit, credit_used) VALUES ($1, $2, $3, $4, 0) RETURNING id",
    [username, passwordHash, resolvedRole, creditLimit]
  );
  return { id: rows[0].id, username, role: resolvedRole, creditLimit };
}

export async function upsertLottery({ code, name, kind = "international", openTime, closeTime, status = "open", description = null, group = null }) {
  if (!pool) throw new Error("Database not configured");
  if (!code || !name) throw new Error("ต้องระบุรหัสและชื่อหวย");
  const query = `
    INSERT INTO lotteries (code, name, kind, open_time, close_time, status, description, group_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      open_time = EXCLUDED.open_time,
      close_time = EXCLUDED.close_time,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      group_name = EXCLUDED.group_name
    RETURNING code, name, kind, open_time AS "openTime", close_time AS "closeTime", status, description, group_name AS "groupName"
  `;
  const { rows } = await pool.query(query, [code, name, kind, openTime ? new Date(openTime) : new Date(), closeTime ? new Date(closeTime) : new Date(), status, description, group]);
  return rows?.[0];
}

export async function ensureSuperAdmin({ username, passwordHash, creditLimit = 500000, resetPassword = false }) {
  if (!pool || !username || !passwordHash) return null;
  const { rows } = await pool.query("SELECT id, credit_limit FROM users WHERE username = $1 LIMIT 1", [username]);
  if (rows.length) {
    const existing = rows[0];
    // ไม่รีเซ็ตรหัสผ่าน/เครดิตทุกครั้งที่ restart; รีเซ็ตรหัสผ่านเฉพาะเมื่อตั้ง SUPERADMIN_PASSWORD ไว้ชัดเจน
    if (resetPassword) {
      await pool.query("UPDATE users SET role = 'admin', password_hash = $1 WHERE id = $2", [passwordHash, existing.id]);
    } else {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [existing.id]);
    }
    return { id: existing.id, username, created: false, creditLimit: Number(existing.credit_limit ?? 0) };
  }
  const { rows: created } = await pool.query(
    "INSERT INTO users (username, password_hash, role, credit_limit, credit_used) VALUES ($1, $2, 'admin', $3, 0) RETURNING id",
    [username, passwordHash, creditLimit ?? 0]
  );
  return { id: created[0].id, username, created: true, creditLimit };
}

export async function updateUserCredit(userId, { creditLimit, creditUsed, topupAmount }) {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query("SELECT credit_limit, credit_used FROM users WHERE id = $1", [userId]);
  if (!rows.length) throw new Error("USER_NOT_FOUND");
  let nextLimit = Number(rows[0].credit_limit ?? 0);
  let nextUsed = Number(rows[0].credit_used ?? 0);

  if (typeof topupAmount === "number" && !Number.isNaN(topupAmount) && topupAmount > 0) {
    // เติมเครดิต = เพิ่มวงเงินรวม (credit_limit) เพื่อให้ใช้ได้เพิ่ม
    nextLimit += topupAmount;
  }
  if (typeof creditLimit === "number" && !Number.isNaN(creditLimit)) {
    nextLimit = creditLimit;
  }
  if (typeof creditUsed === "number" && !Number.isNaN(creditUsed)) {
    nextUsed = creditUsed;
  }

  const result = await pool.query("UPDATE users SET credit_limit = $1, credit_used = $2 WHERE id = $3", [
    nextLimit,
    nextUsed,
    userId
  ]);
  return { ...result, creditLimit: nextLimit, creditUsed: nextUsed };
}

export async function updateUserPassword(userId, passwordHash) {
  if (!pool) throw new Error("Database not configured");
  if (!userId || !passwordHash) throw new Error("ข้อมูลไม่ครบ");
  await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
}

export async function saveTicketRecord({
  username,
  lotteryCode,
  betType,
  numbers,
  amount,
  payoutRate,
  status,
  promotionCode,
  drawDate
}) {
  if (!pool) return null;
  const userId = await fetchUserIdByUsername(username);
  if (!userId) return null;
  const buildInsert = ({ includePromotion, includeDrawDate }) => {
    const columns = ["user_id", "lottery_code", "bet_type", "numbers", "amount", "payout_rate", "status"];
    const values = [userId, lotteryCode, betType, numbers, amount, payoutRate ?? null, status ?? "pending"];
    if (includeDrawDate) {
      columns.push("draw_date");
      values.push(drawDate ?? null);
    }
    if (includePromotion) {
      columns.push("promotion_code");
      values.push(promotionCode ?? null);
    }
    const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
    return { sql: `INSERT INTO tickets (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`, values };
  };

  let includePromotion = supportsTicketPromotionColumn;
  let includeDrawDate = supportsTicketDrawDateColumn;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { sql, values } = buildInsert({ includePromotion, includeDrawDate });
      const { rows } = await pool.query(sql, values);
      return { ticketId: rows[0].id, userId };
    } catch (err) {
      if (err.code !== "42703") throw err;
      const msg = String(err.message || "");
      let changed = false;
      if ((msg.includes("promotion_code") || !msg) && includePromotion) {
        includePromotion = false;
        supportsTicketPromotionColumn = false;
        changed = true;
      }
      if ((msg.includes("draw_date") || !msg) && includeDrawDate) {
        includeDrawDate = false;
        supportsTicketDrawDateColumn = false;
        changed = true;
      }
      if (!changed) {
        throw err;
      }
    }
  }
  return null;
}

export async function logPurchase(ticketInfo) {
  if (!pool) return;
  await ensurePurchaseLogOptionalColumns();
  const { ticketId, userId, lotteryCode, betType, numbers, amount, drawDate } = ticketInfo;
  const baseColumns = ["ticket_id", "user_id", "lottery_code", "bet_type", "numbers", "amount"];
  const baseValues = [ticketId || null, userId || null, lotteryCode, betType, numbers, amount];
  const buildInsert = ({ includeDrawDate, includeOptional }) => {
    const columns = [...baseColumns];
    const values = [...baseValues];
    if (includeDrawDate) {
      columns.push("draw_date");
      values.push(drawDate ?? null);
    }
    if (includeOptional) {
      columns.push("payout_rate", "status", "paid");
      values.push(ticketInfo.payoutRate ?? null, "pending", false);
    }
    const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
    return { sql: `INSERT INTO purchase_logs (${columns.join(", ")}) VALUES (${placeholders})`, values };
  };

  let includeDrawDate = supportsPurchaseLogDrawDateColumn;
  let includeOptional = supportsPurchaseLogRateColumn || supportsPurchaseLogStatusColumn || supportsPurchaseLogPaidColumn;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { sql, values } = buildInsert({ includeDrawDate, includeOptional });
      await pool.query(sql, values);
      return;
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
      const msg = String(err.message || "");
      let changed = false;
      if ((msg.includes("draw_date") || !msg) && includeDrawDate) {
        includeDrawDate = false;
        supportsPurchaseLogDrawDateColumn = false;
        changed = true;
      }
      if (
        (msg.includes("payout_rate") || msg.includes("status") || msg.includes("paid") || !msg) &&
        includeOptional
      ) {
        includeOptional = false;
        supportsPurchaseLogRateColumn = false;
        supportsPurchaseLogStatusColumn = false;
        supportsPurchaseLogPaidColumn = false;
        changed = true;
      }
      if (!changed) {
        throw err;
      }
    }
  }
}

export async function fetchPurchaseLogs(limit = 100) {
  if (!pool) throw new Error("Database not configured");
  await ensurePurchaseLogOptionalColumns();
  try {
    const { rows } = await pool.query(
      "SELECT id, ticket_id as \"ticketId\", user_id as \"userId\", lottery_code as \"lotteryCode\", bet_type as \"betType\", numbers, amount, payout_rate as \"payoutRate\", status, paid, created_at as \"createdAt\" FROM purchase_logs ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return rows;
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
  const { rows } = await pool.query(
    "SELECT id, ticket_id as \"ticketId\", user_id as \"userId\", lottery_code as \"lotteryCode\", bet_type as \"betType\", numbers, amount, created_at as \"createdAt\" FROM purchase_logs ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return rows.map((row) => ({ ...row, payoutRate: null, status: null }));
}

export async function fetchNumberSummaryForDraw(lotteryCode, drawDate) {
  if (!pool) throw new Error("Database not configured");
  if (!lotteryCode || !drawDate) return [];
  await ensurePurchaseLogOptionalColumns();
  const params = [lotteryCode, drawDate];
  const buildQuery = (withStatus, withDrawDate) => `
    SELECT numbers,
           bet_type AS "betType",
           SUM(amount) AS "totalAmount",
           COUNT(*)::int AS "ticketCount",
           COUNT(DISTINCT user_id)::int AS "userCount"
      FROM purchase_logs
     WHERE lottery_code = $1
       AND ${withDrawDate ? "COALESCE(draw_date, created_at::date)" : "created_at::date"} = $2
       ${withStatus ? "AND COALESCE(status, '') <> 'cancelled'" : ""}
     GROUP BY numbers, bet_type
     ORDER BY SUM(amount) DESC, numbers ASC
  `;
  try {
    const { rows } = await pool.query(
      buildQuery(supportsPurchaseLogStatusColumn, supportsPurchaseLogDrawDateColumn),
      params
    );
    return rows
      .map((row) => ({
        number: row.numbers,
        betType: row.betType,
        totalAmount: Number(row.totalAmount ?? 0),
        ticketCount: Number(row.ticketCount ?? 0),
        userCount: Number(row.userCount ?? 0)
      }))
      .filter((row) => row.number);
  } catch (err) {
    if (isMissingColumn(err)) {
      const msg = String(err.message || "");
      let changed = false;
      if ((msg.includes("status") || !msg) && supportsPurchaseLogStatusColumn) {
        supportsPurchaseLogStatusColumn = false;
        changed = true;
      }
      if ((msg.includes("draw_date") || !msg) && supportsPurchaseLogDrawDateColumn) {
        supportsPurchaseLogDrawDateColumn = false;
        changed = true;
      }
      if (changed) {
        return fetchNumberSummaryForDraw(lotteryCode, drawDate);
      }
    }
    throw err;
  }
}

export async function fetchNumberSummaryForRange(lotteryCode, startDate, endDate) {
  if (!pool) throw new Error("Database not configured");
  if (!lotteryCode || !startDate || !endDate) return [];
  await ensurePurchaseLogOptionalColumns();
  const params = [lotteryCode, startDate, endDate];
  const buildQuery = (withStatus, withDrawDate) => `
    SELECT numbers,
           bet_type AS "betType",
           SUM(amount) AS "totalAmount",
           COUNT(*)::int AS "ticketCount",
           COUNT(DISTINCT user_id)::int AS "userCount"
      FROM purchase_logs
     WHERE lottery_code = $1
       AND ${withDrawDate ? "COALESCE(draw_date, created_at::date)" : "created_at::date"} BETWEEN $2 AND $3
       ${withStatus ? "AND COALESCE(status, '') <> 'cancelled'" : ""}
     GROUP BY numbers, bet_type
     ORDER BY SUM(amount) DESC, numbers ASC
  `;
  try {
    const { rows } = await pool.query(
      buildQuery(supportsPurchaseLogStatusColumn, supportsPurchaseLogDrawDateColumn),
      params
    );
    return rows
      .map((row) => ({
        number: row.numbers,
        betType: row.betType,
        totalAmount: Number(row.totalAmount ?? 0),
        ticketCount: Number(row.ticketCount ?? 0),
        userCount: Number(row.userCount ?? 0)
      }))
      .filter((row) => row.number);
  } catch (err) {
    if (isMissingColumn(err)) {
      const msg = String(err.message || "");
      let changed = false;
      if ((msg.includes("status") || !msg) && supportsPurchaseLogStatusColumn) {
        supportsPurchaseLogStatusColumn = false;
        changed = true;
      }
      if ((msg.includes("draw_date") || !msg) && supportsPurchaseLogDrawDateColumn) {
        supportsPurchaseLogDrawDateColumn = false;
        changed = true;
      }
      if (changed) {
        return fetchNumberSummaryForRange(lotteryCode, startDate, endDate);
      }
    }
    throw err;
  }
}

export async function fetchPurchaseLogsByTicket(ticketId) {
  if (!pool) return [];
  await ensurePurchaseLogOptionalColumns();
  try {
    const { rows } = await pool.query(
      "SELECT id, ticket_id as \"ticketId\", user_id as \"userId\", lottery_code as \"lotteryCode\", bet_type as \"betType\", numbers, amount, payout_rate as \"payoutRate\", status, paid FROM purchase_logs WHERE ticket_id = $1",
      [ticketId]
    );
    return rows;
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
  const { rows } = await pool.query(
    "SELECT id, ticket_id as \"ticketId\", user_id as \"userId\", lottery_code as \"lotteryCode\", bet_type as \"betType\", numbers, amount FROM purchase_logs WHERE ticket_id = $1",
    [ticketId]
  );
  return rows.map((row) => ({ ...row, payoutRate: null, status: null }));
}

export async function markPurchaseLogsStatus(logIds, status, payoutRate = null) {
  if (!pool || !Array.isArray(logIds) || !logIds.length) return;
  await ensurePurchaseLogOptionalColumns();
  try {
    await pool.query(
      "UPDATE purchase_logs SET status = COALESCE($1, status), payout_rate = COALESCE($2, payout_rate), paid = CASE WHEN $4 THEN TRUE ELSE paid END WHERE id = ANY($3::bigint[])",
      [status ?? null, payoutRate ?? null, logIds, status === "won"]
    );
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
}

export async function fetchPayoutRates(lotteryCode) {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query(
    "SELECT bet_type as \"betType\", number_pattern as \"numberPattern\", rate FROM payout_rates WHERE lottery_code = $1 ORDER BY bet_type",
    [lotteryCode]
  );
  return rows;
}

export async function fetchLotteryRounds(lotteryCode) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query("SELECT rounds FROM lottery_rounds WHERE lottery_code = $1 LIMIT 1", [lotteryCode]);
    if (!rows.length) return null;
    const data = rows[0].rounds;
    return data;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

export async function upsertLotteryRounds(lotteryCode, rounds) {
  if (!pool) throw new Error("Database not configured");
  const payload = [lotteryCode, rounds ? JSON.stringify(rounds) : null];
  const { rows } = await pool.query(
    `INSERT INTO lottery_rounds (lottery_code, rounds) VALUES ($1, $2)
     ON CONFLICT (lottery_code) DO UPDATE SET rounds = EXCLUDED.rounds, updated_at = CURRENT_TIMESTAMP
     RETURNING lottery_code, rounds, updated_at`,
    payload
  );
  return rows[0] ?? null;
}

export async function replacePayoutRates(lotteryCode, rates) {
  if (!pool) throw new Error("Database not configured");
  await pool.query("DELETE FROM payout_rates WHERE lottery_code = $1", [lotteryCode]);
  if (!Array.isArray(rates) || !rates.length) return;
  const filtered = rates.filter((item) => item.betType && typeof item.rate === "number");
  if (!filtered.length) return;
  const values = [];
  const placeholders = filtered
    .map((item, idx) => {
      const base = idx * 4;
      values.push(lotteryCode, item.betType, item.numberPattern ?? null, item.rate);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    })
    .join(", ");
  await pool.query(`INSERT INTO payout_rates (lottery_code, bet_type, number_pattern, rate) VALUES ${placeholders}`, values);
}

function mapNumberRestrictionRow(row) {
  return {
    id: row.id,
    lotteryCode: row.lottery_code,
    betType: row.bet_type,
    number: row.number,
    payoutRate: row.payout_rate != null ? Number(row.payout_rate) : null,
    maxAmount: row.max_amount != null ? Number(row.max_amount) : null,
    discountPercent: row.discount_percent != null ? Number(row.discount_percent) : null,
    scope: row.scope ?? null,
    note: row.note ?? "",
    createdAt: row.created_at
  };
}

export async function listNumberRestrictions({ lotteryCode } = {}) {
  if (!pool) return [];
  const params = [];
  let where = "";
  if (lotteryCode) {
    params.push(lotteryCode);
    where = "WHERE lottery_code = $1";
  }
  const columnFragment = supportsAdvancedNumberRestrictionColumns
    ? "payout_rate, max_amount, discount_percent, scope, note"
    : "payout_rate, NULL::NUMERIC AS max_amount, NULL::NUMERIC AS discount_percent, NULL::VARCHAR AS scope, NULL::TEXT AS note";
  try {
    const { rows } = await pool.query(
      `SELECT id, lottery_code, bet_type, number, ${columnFragment}, created_at FROM number_restrictions ${where} ORDER BY created_at DESC`,
      params
    );
    return rows.map(mapNumberRestrictionRow);
  } catch (err) {
    if (isMissingColumn(err)) {
      supportsAdvancedNumberRestrictionColumns = false;
      return listNumberRestrictions({ lotteryCode });
    }
    if (isMissingRelation(err)) {
      return [];
    }
    throw err;
  }
}

export async function createNumberRestriction({ lotteryCode, betType, number, payoutRate, maxAmount, discountPercent, scope, note }) {
  if (!pool) throw new Error("Database not configured");
  try {
    let query = "INSERT INTO number_restrictions (lottery_code, bet_type, number, payout_rate, max_amount, discount_percent, scope, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, lottery_code, bet_type, number, payout_rate, max_amount, discount_percent, scope, note, created_at";
    let payload = [lotteryCode, betType, number, payoutRate ?? null, maxAmount ?? null, discountPercent ?? null, scope ?? null, note ?? null];
    if (!supportsAdvancedNumberRestrictionColumns) {
      query =
        "INSERT INTO number_restrictions (lottery_code, bet_type, number, payout_rate) VALUES ($1, $2, $3, $4) RETURNING id, lottery_code, bet_type, number, payout_rate, NULL::NUMERIC AS max_amount, NULL::NUMERIC AS discount_percent, NULL::VARCHAR AS scope, NULL::TEXT AS note, created_at";
      payload = [lotteryCode, betType, number, payoutRate ?? null];
    }
    const { rows } = await pool.query(query, payload);
    return mapNumberRestrictionRow(rows[0]);
  } catch (err) {
    if (isMissingColumn(err)) {
      supportsAdvancedNumberRestrictionColumns = false;
      return createNumberRestriction({ lotteryCode, betType, number, payoutRate, maxAmount, discountPercent, scope, note });
    }
    if (isMissingRelation(err)) {
      throw new Error("ยังไม่ได้สร้างตารางเลขอั้นในฐานข้อมูล");
    }
    throw err;
  }
}

export async function deleteNumberRestriction(id) {
  if (!pool) throw new Error("Database not configured");
  try {
    await pool.query("DELETE FROM number_restrictions WHERE id = $1", [id]);
  } catch (err) {
    if (isMissingRelation(err)) {
      return;
    }
    throw err;
  }
}

function mapLotteryResultRow(row) {
  if (!row) return null;
  const drawDate =
    row.draw_date instanceof Date
      ? `${row.draw_date.getFullYear()}-${String(row.draw_date.getMonth() + 1).padStart(2, "0")}-${String(row.draw_date.getDate()).padStart(2, "0")}`
      : row.draw_date;
  return {
    lotteryCode: row.lottery_code,
    drawDate,
    title: row.lottery_code === "th-lottery" ? "ผลหวยรัฐบาลไทย" : row.lottery_code === "lao-lottery" ? "ผลหวยลาวพัฒนา" : row.lottery_code,
    firstPrize: row.first_prize ?? undefined,
    frontThree: [row.front_three_a, row.front_three_b].filter(Boolean),
    backThree: [row.back_three_a, row.back_three_b].filter(Boolean),
    nearFirst: [row.near_first_a, row.near_first_b].filter(Boolean),
    twoDigits: row.two_digits ?? undefined,
    threeDigits: row.three_digits ?? undefined,
    extra: Array.isArray(row.extra) ? row.extra : row.extra ? row.extra : undefined
  };
}

export async function fetchLatestResults(lotteryCodes = []) {
  if (!pool) return {};
  const params = [];
  let where = "";
  if (Array.isArray(lotteryCodes) && lotteryCodes.length) {
    params.push(lotteryCodes);
    where = "WHERE lottery_code = ANY($1::text[])";
  }
  const { rows } = await pool.query(
    `SELECT lottery_code, draw_date, first_prize, front_three_a, front_three_b, back_three_a, back_three_b, two_digits, three_digits, near_first_a, near_first_b, extra
     FROM lottery_results
     ${where}
     ORDER BY lottery_code, draw_date DESC`
      .trim(),
    params
  );
  const latest = {};
  for (const row of rows) {
    if (!latest[row.lottery_code]) {
      const record = mapLotteryResultRow(row);
      if (record && typeof record.extra === "string") {
        try {
          record.extra = JSON.parse(record.extra);
        } catch {
          record.extra = undefined;
        }
      }
      latest[row.lottery_code] = record;
    }
  }
  return latest;
}

export async function fetchResultForDraw(lotteryCode, drawDate) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT lottery_code, draw_date, first_prize, front_three_a, front_three_b, back_three_a, back_three_b, two_digits, three_digits, near_first_a, near_first_b, extra
     FROM lottery_results
     WHERE lottery_code = $1 AND draw_date = $2
     LIMIT 1`,
    [lotteryCode, drawDate]
  );
  if (!rows.length) return null;
  const record = mapLotteryResultRow(rows[0]);
  if (record && typeof record.extra === "string") {
    try {
      record.extra = JSON.parse(record.extra);
    } catch {
      record.extra = undefined;
    }
  }
  return record;
}

export async function upsertLotteryResult({
  lotteryCode,
  drawDate,
  firstPrize,
  frontThree = [],
  backThree = [],
  twoDigits,
  threeDigits,
  nearFirst = [],
  extra
}) {
  if (!pool) throw new Error("Database not configured");
  if (!lotteryCode || !drawDate) {
    throw new Error("lotteryCode และ drawDate จำเป็นต้องระบุ");
  }
  const payload = [
    lotteryCode,
    drawDate,
    firstPrize ?? null,
    frontThree?.[0] ?? null,
    frontThree?.[1] ?? null,
    backThree?.[0] ?? null,
    backThree?.[1] ?? null,
    twoDigits ?? null,
    threeDigits ?? null,
    nearFirst?.[0] ?? null,
    nearFirst?.[1] ?? null,
    extra ? JSON.stringify(extra) : null
  ];
  const { rows } = await pool.query(
    `INSERT INTO lottery_results (lottery_code, draw_date, first_prize, front_three_a, front_three_b, back_three_a, back_three_b, two_digits, three_digits, near_first_a, near_first_b, extra)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (lottery_code, draw_date) DO UPDATE SET
        first_prize = EXCLUDED.first_prize,
        front_three_a = EXCLUDED.front_three_a,
        front_three_b = EXCLUDED.front_three_b,
        back_three_a = EXCLUDED.back_three_a,
        back_three_b = EXCLUDED.back_three_b,
        two_digits = EXCLUDED.two_digits,
        three_digits = EXCLUDED.three_digits,
        near_first_a = EXCLUDED.near_first_a,
        near_first_b = EXCLUDED.near_first_b,
        extra = EXCLUDED.extra
     RETURNING lottery_code, draw_date, first_prize, front_three_a, front_three_b, back_three_a, back_three_b, two_digits, three_digits, near_first_a, near_first_b, extra`,
    payload
  );
  const record = mapLotteryResultRow(rows[0]);
  if (record && typeof record.extra === "string") {
    try {
      record.extra = JSON.parse(record.extra);
    } catch {
      record.extra = undefined;
    }
  }
  return record;
}

export async function adjustUserCreditUsage(userId, delta) {
  if (!pool) throw new Error("Database not configured");
  if (!userId || typeof delta !== "number" || Number.isNaN(delta)) {
    throw new Error("ข้อมูลไม่ถูกต้อง");
  }
  const { rows } = await pool.query("SELECT credit_limit, credit_used FROM users WHERE id = $1", [userId]);
  if (!rows.length) {
    throw new Error("ไม่พบผู้ใช้");
  }
  const creditLimit = Number(rows[0].credit_limit ?? 0);
  const currentUsed = Number(rows[0].credit_used ?? 0);
  const targetUsed = currentUsed + delta;
  if (delta > 0 && targetUsed > creditLimit) {
    throw new Error("ยอดเครดิตไม่เพียงพอ");
  }
  const nextUsed = Math.max(0, Math.min(creditLimit, targetUsed));
  await pool.query("UPDATE users SET credit_used = $2 WHERE id = $1", [userId, nextUsed]);
  return { creditLimit, creditUsed: nextUsed, creditAvailable: creditLimit - nextUsed };
}

export async function seedInitialData({ lotteriesSeed = [], usersSeed = [], payoutSeed = {}, resultsSeed = {} }) {
  if (!pool) return;
  for (const lottery of lotteriesSeed) {
    if (!lottery?.code) continue;
    await pool.query(
      `INSERT INTO lotteries (code, name, kind, open_time, close_time, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO NOTHING`,
      [
        lottery.code,
        lottery.name,
        lottery.kind,
        lottery.openTime ? new Date(lottery.openTime) : new Date(),
        lottery.closeTime ? new Date(lottery.closeTime) : new Date(),
        lottery.status ?? "open",
        lottery.description ?? null
      ]
    );
  }

  for (const seed of usersSeed) {
    if (!seed?.username || !seed?.passwordHash) continue;
    await pool.query(
      `INSERT INTO users (username, password_hash, role, credit_limit, credit_used)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO NOTHING`,
      [seed.username, seed.passwordHash, seed.role ?? "agent", seed.creditLimit ?? 0, seed.creditUsed ?? 0]
    );
  }

  for (const [lotteryCode, rates] of Object.entries(payoutSeed)) {
    if (!lotteryCode || !Array.isArray(rates) || !rates.length) continue;
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM payout_rates WHERE lottery_code = $1", [lotteryCode]);
    if (Number(rows?.[0]?.count ?? 0) > 0) continue;
    await replacePayoutRates(lotteryCode, rates);
  }

  // ผลจำลองใส่เฉพาะงวดที่ยังไม่มีผล (ไม่เขียนทับผลจริง)
  for (const [lotteryCode, result] of Object.entries(resultsSeed)) {
    if (!lotteryCode || !result?.drawDate) continue;
    if (await fetchResultForDraw(lotteryCode, result.drawDate)) continue;
    await upsertLotteryResult({
      lotteryCode,
      drawDate: result.drawDate,
      firstPrize: result.firstPrize,
      frontThree: result.frontThree,
      backThree: result.backThree,
      twoDigits: result.twoDigits,
      threeDigits: result.threeDigits,
      nearFirst: result.nearFirst,
      extra: result.extra
    });
  }
}

export async function countOpenLotteries() {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM lotteries WHERE status = 'open'");
  return Number(rows?.[0]?.count ?? 0);
}

export async function sumTicketAmount({ todayOnly = false, userId } = {}) {
  if (!pool) throw new Error("Database not configured");
  const conditions = [];
  const params = [];
  if (todayOnly) {
    conditions.push("created_at::date = CURRENT_DATE");
  }
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM tickets ${where}`, params);
  return Number(rows?.[0]?.total ?? 0);
}

export async function fetchLedger(limit = 50, { userId } = {}) {
  if (!pool) throw new Error("Database not configured");
  await ensurePurchaseLogOptionalColumns();
  const buildQuery = ({ includePromotion, includeDrawDate }) => {
    const promoSelect = includePromotion ? "t.promotion_code," : "";
    const drawSelect = includeDrawDate ? "t.draw_date AS \"drawDate\"," : "";
    const promoGroup = includePromotion ? ", t.promotion_code" : "";
    const drawGroup = includeDrawDate ? ", t.draw_date" : "";
    return `SELECT t.id,
            u.username AS member,
            t.lottery_code AS "lotteryId",
            t.numbers,
            ${promoSelect}
            t.amount AS debit,
            COALESCE(SUM(CASE WHEN pl.status = 'won' THEN COALESCE(pl.payout_amount, pl.amount * COALESCE(pl.payout_rate, t.payout_rate)) END), 0) AS credit,
            t.status,
            t.created_at AS "createdAt",
            ${drawSelect}
            COALESCE(json_agg(json_build_object('id', pl.id, 'number', pl.numbers, 'amount', pl.amount, 'betType', pl.bet_type, 'payoutRate', pl.payout_rate, 'payoutAmount', pl.payout_amount, 'status', pl.status) ORDER BY pl.id) FILTER (WHERE pl.id IS NOT NULL), '[]') AS items
       FROM tickets t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN purchase_logs pl ON pl.ticket_id = t.id
      ${userId ? "WHERE t.user_id = $2" : ""}
      GROUP BY t.id, u.username, t.lottery_code, t.numbers${promoGroup}, t.amount, t.payout_rate, t.created_at, t.status${drawGroup}
      ORDER BY t.created_at DESC
      LIMIT $1`;
  };

  let includePromotion = supportsLedgerPromotionColumn;
  let includeDrawDate = supportsTicketDrawDateColumn;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const params = userId ? [limit, userId] : [limit];
      const { rows } = await pool.query(buildQuery({ includePromotion, includeDrawDate }), params);
      return rows.map((row) => {
        const items = (row.items || []).map((it) => ({
          ...it,
          credit:
            it.status === "won"
              ? Number(it.payoutAmount ?? Number(it.amount ?? 0) * Number(it.payoutRate ?? row.payout_rate ?? 0))
              : 0
        }));
        const hasWinItem = items.some((it) => it.status === "won");
        const creditTotal = Number(row.credit ?? 0);
        return {
          id: row.id,
          member: row.member ?? "unknown",
          lotteryId: row.lotteryId,
          numbers: normalizeNumberList(row.numbers),
          promotionCode: includePromotion ? row.promotion_code ?? null : null,
          debit: Number(row.debit ?? 0),
          credit: creditTotal,
          status: row.status === "cancelled" ? "cancelled" : hasWinItem || creditTotal > 0 ? "won" : row.status ?? "pending",
          createdAt: row.createdAt,
          items,
          drawDate: row.drawDate ?? (row.createdAt instanceof Date ? row.createdAt.toISOString().slice(0, 10) : (row.createdAt ? String(row.createdAt).slice(0, 10) : null))
        };
      });
    } catch (err) {
      if (err.code === "42P01") {
        return [];
      }
      if (err.code !== "42703") {
        throw err;
      }
      const msg = String(err.message || "");
      let changed = false;
      if ((msg.includes("promotion_code") || !msg) && includePromotion) {
        includePromotion = false;
        supportsLedgerPromotionColumn = false;
        changed = true;
      }
      if ((msg.includes("draw_date") || !msg) && includeDrawDate) {
        includeDrawDate = false;
        supportsTicketDrawDateColumn = false;
        changed = true;
      }
      if (!changed) {
        throw err;
      }
    }
  }
  return [];
}

export async function fetchDailyTicketSummary(userId = null) {
  if (!pool) throw new Error("Database not configured");
  const params = [];
  let where = "WHERE created_at::date = CURRENT_DATE";
  if (userId) {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total_tickets,
            COALESCE(SUM(amount),0) AS total_amount
       FROM tickets
       ${where}`,
    params
  );
  const row = rows?.[0] ?? {};
  return {
    date: new Date().toISOString().slice(0, 10),
    totalTickets: Number(row.total_tickets ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    estimateRevenue: Number(row.total_amount ?? 0) * 0.2
  };
}

export async function fetchIncomeReportFromDb() {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query(
    `SELECT l.name AS lottery,
            COALESCE(SUM(t.amount),0) AS total_stake
       FROM tickets t
       LEFT JOIN lotteries l ON l.code = t.lottery_code
      GROUP BY l.name`
  );
  return rows.map((row) => ({
    lottery: row.lottery ?? "unknown",
    totalStake: Number(row.total_stake ?? 0),
    estimatedMargin: Number(row.total_stake ?? 0) * 0.18
  }));
}

export async function fetchUserProfile(userId) {
  if (!pool || !userId) return null;
  const { rows } = await pool.query(
    "SELECT user_id, full_name, bank_name, bank_account, bank_branch, bsb, registration_no, phone FROM user_profiles WHERE user_id = $1",
    [userId]
  );
  return rows.length ? rows[0] : null;
}

export async function upsertUserProfile(userId, data = {}) {
  if (!pool || !userId) throw new Error("ข้อมูลไม่ถูกต้อง");
  const payload = [
    userId,
    data.fullName ?? null,
    data.bankName ?? null,
    data.bankAccount ?? null,
    data.bankBranch ?? null,
    data.bsb ?? null,
    data.registrationNo ?? null,
    data.phone ?? null
  ];
  await pool.query(
    `INSERT INTO user_profiles (user_id, full_name, bank_name, bank_account, bank_branch, bsb, registration_no, phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       bank_name = EXCLUDED.bank_name,
       bank_account = EXCLUDED.bank_account,
       bank_branch = EXCLUDED.bank_branch,
       bsb = EXCLUDED.bsb,
       registration_no = EXCLUDED.registration_no,
       phone = EXCLUDED.phone,
       updated_at = CURRENT_TIMESTAMP`,
    payload
  );
  return fetchUserProfile(userId);
}

export async function recordTransaction({ userId, type, amount, status = "pending", note }) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsTransactionTable) {
    throw transactionsUnavailableError();
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO transactions (user_id, txn_type, status, amount, note) VALUES ($1,$2,$3,$4,$5) RETURNING id, user_id, txn_type, status, amount, note, created_at",
      [userId, type, status, amount, note ?? null]
    );
    return rows[0];
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsTransactionTable = false;
      throw transactionsUnavailableError();
    }
    throw err;
  }
}

export async function fetchTransactionById(id) {
  if (!pool) return null;
  const { rows } = await pool.query("SELECT id, user_id AS \"userId\", txn_type AS txnType, status, amount, note, created_at FROM transactions WHERE id = $1 LIMIT 1", [id]);
  return rows?.[0] ?? null;
}

export async function updateTransactionStatus(id, status) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query("UPDATE transactions SET status = $2 WHERE id = $1 RETURNING id, user_id AS \"userId\", txn_type AS txnType, status, amount, note, created_at", [id, status]);
    return rows?.[0] ?? null;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

export async function listTransactions({ limit = 100, userId } = {}) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsTransactionTable) {
    throw transactionsUnavailableError();
  }
  const params = [limit];
  let where = "";
  if (userId) {
    params.unshift(userId);
    where = "WHERE user_id = $1";
    params[1] = limit;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, txn_type, status, amount, note, created_at
         FROM transactions
         ${where}
         ORDER BY created_at DESC
         LIMIT $${where ? 2 : 1}`,
      params
    );
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsTransactionTable = false;
      throw transactionsUnavailableError();
    }
    throw err;
  }
}

export async function recordAuditLog({ userId, action, details }) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsAuditLogTable) {
    throw auditLogsUnavailableError();
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO audit_logs (user_id, action, details) VALUES ($1,$2,$3) RETURNING id, user_id AS \"userId\", action, details, created_at",
      [userId ?? null, action, details ?? null]
    );
    return rows?.[0] ?? null;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsAuditLogTable = false;
      throw auditLogsUnavailableError();
    }
    throw err;
  }
}

export async function listAuditLogs({ limit = 200 } = {}) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsAuditLogTable) {
    throw auditLogsUnavailableError();
  }
  try {
    const { rows } = await pool.query(
      `SELECT audit_logs.id,
              audit_logs.user_id AS "userId",
              users.username AS "actorUsername",
              audit_logs.action,
              audit_logs.details,
              audit_logs.created_at
         FROM audit_logs
         LEFT JOIN users ON users.id = audit_logs.user_id
         ORDER BY audit_logs.created_at DESC
         LIMIT $1`,
      [limit]
    );
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsAuditLogTable = false;
      throw auditLogsUnavailableError();
    }
    throw err;
  }
}

export async function listPromotions() {
  if (!pool) throw new Error("Database not configured");
  const seedPromos = [
    { promo_code: "STANDARD", title: "ราคาปกติ", description: "อัตราจ่ายมาตรฐาน", discount_percent: 0 },
    { promo_code: "DISCOUNT30", title: "ลด 30%", description: "ลดต้นทุนเดิมพัน 30% ต่อบิล", discount_percent: 30 }
  ];
  try {
    for (const promo of seedPromos) {
      await pool.query(
        `INSERT INTO promotions (promo_code, title, description, discount_percent)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (promo_code) DO NOTHING`,
        [promo.promo_code, promo.title, promo.description, promo.discount_percent]
      );
    }
    const { rows } = await pool.query("SELECT promo_code AS code, title, description, discount_percent, active FROM promotions WHERE active = TRUE ORDER BY id ASC");
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) {
      return seedPromos.map((promo) => ({
        code: promo.promo_code,
        title: promo.title,
        description: promo.description,
        discount_percent: promo.discount_percent,
        active: true
      }));
    }
    throw err;
  }
}

export async function getLiveSetting() {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query("SELECT enabled FROM live_settings WHERE id = 1");
  return rows.length ? rows[0].enabled : true;
}

export async function setLiveSetting(enabled) {
  if (!pool) throw new Error("Database not configured");
  await pool.query("INSERT INTO live_settings (id, enabled, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = CURRENT_TIMESTAMP", [
    enabled
  ]);
  return { enabled };
}

async function ensureChatThread(userId) {
  if (!supportsChatTables) return null;
  try {
    const { rows } = await pool.query("SELECT id FROM chat_threads WHERE user_id = $1 LIMIT 1", [userId]);
    if (rows.length) return rows[0].id;
    const { rows: created } = await pool.query("INSERT INTO chat_threads (user_id) VALUES ($1) RETURNING id", [userId]);
    return created[0].id;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsChatTables = false;
      return null;
    }
    throw err;
  }
}

export async function appendChatMessage({ userId, sender, message }) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsChatTables) {
    throw chatUnavailableError();
  }
  const threadId = await ensureChatThread(userId);
  if (!threadId) {
    throw chatUnavailableError();
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO chat_messages (thread_id, sender, message) VALUES ($1,$2,$3) RETURNING id, thread_id, sender, message, created_at",
      [threadId, sender, message]
    );
    await pool.query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [threadId]);
    return rows[0];
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsChatTables = false;
      throw chatUnavailableError();
    }
    throw err;
  }
}

export async function listChatMessages(userId) {
  if (!pool) throw new Error("Database not configured");
  if (!supportsChatTables) throw chatUnavailableError();
  const threadId = await ensureChatThread(userId);
  if (!threadId) throw chatUnavailableError();
  try {
    const { rows } = await pool.query(
      "SELECT id, sender, message, created_at FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC",
      [threadId]
    );
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsChatTables = false;
      throw chatUnavailableError();
    }
    throw err;
  }
}

// --- Ticket evaluation helpers ---
export async function fetchPendingTicketsForDraw(lotteryCode, drawDate) {
  if (!pool) return [];
  if (!lotteryCode || !drawDate) return [];
  const buildQuery = (includeDrawDate) => `
    SELECT t.id, t.user_id AS "userId", u.username AS username, t.lottery_code AS "lotteryCode", t.bet_type AS "betType", t.numbers, t.amount, t.payout_rate AS "payoutRate", t.status, t.created_at AS "createdAt"${includeDrawDate ? ", t.draw_date AS \"drawDate\"" : ""}
      FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
     WHERE t.lottery_code = $1 AND t.status = 'pending' AND ${includeDrawDate ? "COALESCE(t.draw_date, t.created_at::date)" : "t.created_at::date"} = $2
     ORDER BY t.created_at ASC`;
  let includeDrawDate = supportsTicketDrawDateColumn;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { rows } = await pool.query(buildQuery(includeDrawDate), [lotteryCode, drawDate]);
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        lotteryCode: r.lotteryCode,
        betType: r.betType,
        numbers: normalizeNumberList(r.numbers),
        amount: Number(r.amount ?? 0),
        payoutRate: r.payoutRate ? Number(r.payoutRate) : null,
        status: r.status,
        createdAt: r.createdAt,
        drawDate: r.drawDate ?? null
      }));
    } catch (err) {
      if (err.code !== "42703") throw err;
      const msg = String(err.message || "");
      if ((msg.includes("draw_date") || !msg) && includeDrawDate) {
        includeDrawDate = false;
        supportsTicketDrawDateColumn = false;
        continue;
      }
      throw err;
    }
  }
  return [];
}

export async function fetchTicketById(ticketId) {
  if (!pool) throw new Error("Database not configured");
  if (!ticketId) throw new Error("ticketId required");
  const buildQuery = (includeDrawDate) => `
    SELECT t.id,
           t.user_id AS "userId",
           u.username AS username,
           t.lottery_code AS "lotteryCode",
           t.bet_type AS "betType",
           t.numbers,
           t.amount,
           t.payout_rate AS "payoutRate",
           t.status,
           t.created_at AS "createdAt"${includeDrawDate ? ", t.draw_date AS \"drawDate\"" : ""}
      FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
     WHERE t.id = $1
     LIMIT 1`;
  let includeDrawDate = supportsTicketDrawDateColumn;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { rows } = await pool.query(buildQuery(includeDrawDate), [ticketId]);
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.userId,
        username: r.username,
        lotteryCode: r.lotteryCode,
        betType: r.betType,
        numbers: normalizeNumberList(r.numbers),
        amount: Number(r.amount ?? 0),
        payoutRate: r.payoutRate ? Number(r.payoutRate) : null,
        status: r.status,
        createdAt: r.createdAt,
        drawDate: r.drawDate ?? null
      };
    } catch (err) {
      if (err.code !== "42703") throw err;
      const msg = String(err.message || "");
      if ((msg.includes("draw_date") || !msg) && includeDrawDate) {
        includeDrawDate = false;
        supportsTicketDrawDateColumn = false;
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function markTicketResult(ticketId, status, payoutRate = null) {
  if (!pool) throw new Error("Database not configured");
  if (!ticketId) throw new Error("ticketId required");
  const { rows } = await pool.query(
    "UPDATE tickets SET status = $2, payout_rate = $3 WHERE id = $1 RETURNING id, user_id AS \"userId\", amount",
    [ticketId, status, payoutRate]
  );
  return rows?.[0] ?? null;
}

export async function recalcTicketStatusFromItems(ticketId) {
  if (!pool) throw new Error("Database not configured");
  const { rows } = await pool.query(
    "SELECT status, amount, payout_rate FROM purchase_logs WHERE ticket_id = $1",
    [ticketId]
  );
  if (!rows.length) return null;
  const credit = rows
    .filter((r) => (r.status || "").toLowerCase() === "won")
    .reduce((sum, r) => sum + Number(r.amount ?? 0) * Number(r.payout_rate ?? 0), 0);
  const hasWin = rows.some((r) => (r.status || "").toLowerCase() === "won" || Number(r.payout_rate ?? 0) > 0 && (r.status || "").toLowerCase() === "won");
  const hasPending = rows.some((r) => !r.status || r.status === "pending");
  const nextStatus = hasWin ? "won" : hasPending ? "pending" : "lost";
  await pool.query("UPDATE tickets SET status = $2 WHERE id = $1", [ticketId, nextStatus]);
  return { status: nextStatus, credit };
}

export async function applyPayoutToUser(userId, amount) {
  if (!pool) throw new Error("Database not configured");
  if (!userId || typeof amount !== 'number') throw new Error("Invalid payout parameters");
  const payout = Math.abs(amount);
  const { rows } = await pool.query("UPDATE users SET credit_limit = credit_limit + $1 WHERE id = $2 RETURNING credit_limit, credit_used", [payout, userId]);
  const creditLimit = Number(rows?.[0]?.credit_limit ?? 0);
  const creditUsed = Number(rows?.[0]?.credit_used ?? 0);
  return { creditLimit, creditUsed, creditAvailable: creditLimit - creditUsed };
}

// --- Notifications ---
export async function createNotification({ userId, type, title, message, meta = {} }) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, meta)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, user_id AS "userId", type, title, message, meta, read, created_at`,
      [userId, type, title, message, Object.keys(meta).length ? JSON.stringify(meta) : null]
    );
    return rows[0];
  } catch (err) {
    if (isMissingRelation(err)) {
      // notifications table missing — caller should tolerate null
      return null;
    }
    throw err;
  }
}

export async function fetchNotifications(userId, limit = 50) {
  if (!pool) return [];
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", type, title, message, meta, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map((r) => ({ id: r.id, userId: r.userId, type: r.type, title: r.title, message: r.message, meta: r.meta, read: r.read, createdAt: r.created_at }));
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}

export async function markNotificationRead(notificationId, userId) {
  if (!pool) return null;
  if (!notificationId) throw new Error("notificationId required");
  try {
    const { rows } = await pool.query("UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id, read", [notificationId, userId]);
    return rows?.[0] ?? null;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

export async function listChatThreads() {
  if (!pool) throw new Error("Database not configured");
  if (!supportsChatTables) throw chatUnavailableError();
  try {
    const { rows } = await pool.query(
      `SELECT ct.id, ct.user_id, u.username, ct.updated_at
         FROM chat_threads ct
         LEFT JOIN users u ON u.id = ct.user_id
        ORDER BY ct.updated_at DESC`
    );
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) {
      supportsChatTables = false;
      throw chatUnavailableError();
    }
    throw err;
  }
}

// --- Transactional ticket lifecycle (ซื้อ / ยกเลิก / ตัดสินผล) ---

function businessError(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  return err;
}

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

async function withTransaction(work) {
  if (!pool) throw new Error("Database not configured");
  await ensureSchemaUpgrades();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ตัดเครดิต + บันทึกโพย + รายการ ในธุรกรรมเดียว
// limits: [{ betType, number, maxAmount, adding, scope }] ตรวจยอดรวมของเลขในงวดไม่ให้เกิน maxAmount
export async function createTicketWithItems({ userId, lotteryCode, drawDate, amount, promotionCode, items, limits = [] }) {
  return withTransaction(async (client) => {
    const drawLimits = limits.filter((limit) => limit.scope !== "ticket");
    if (drawLimits.length) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${lotteryCode}:${drawDate}`]);
    }
    const { rows: users } = await client.query(
      "SELECT id, credit_limit, credit_used FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (!users.length) throw businessError("USER_NOT_FOUND", "ไม่พบข้อมูลผู้ใช้");
    const available = Number(users[0].credit_limit ?? 0) - Number(users[0].credit_used ?? 0);
    if (amount > available + 1e-6) {
      throw businessError("INSUFFICIENT_CREDIT", "เครดิตไม่เพียงพอ", { required: amount, available });
    }
    for (const limit of drawLimits) {
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(pl.amount), 0) AS total
           FROM purchase_logs pl
           JOIN tickets t ON t.id = pl.ticket_id
          WHERE pl.lottery_code = $1 AND pl.draw_date = $2 AND pl.bet_type = $3 AND pl.numbers = $4
            AND t.status <> 'cancelled'`,
        [lotteryCode, drawDate, limit.betType, limit.number]
      );
      const total = Number(rows[0]?.total ?? 0);
      if (total + limit.adding > limit.maxAmount + 1e-6) {
        throw businessError("LIMIT_EXCEEDED", `เลข ${limit.number} รับได้อีก ${Math.max(0, limit.maxAmount - total).toLocaleString()} บาท`, {
          number: limit.number,
          betType: limit.betType,
          remaining: Math.max(0, limit.maxAmount - total)
        });
      }
    }
    const { rows: updated } = await client.query(
      "UPDATE users SET credit_limit = credit_limit - $2 WHERE id = $1 RETURNING credit_limit, credit_used",
      [userId, amount]
    );
    const { rows: tickets } = await client.query(
      `INSERT INTO tickets (user_id, lottery_code, bet_type, numbers, amount, payout_rate, status, draw_date, promotion_code)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
       RETURNING id, created_at`,
      [userId, lotteryCode, items[0].betType, JSON.stringify(items.map((it) => it.number)), amount, items[0].payoutRate ?? null, drawDate, promotionCode ?? null]
    );
    const ticketId = tickets[0].id;
    const values = [];
    const placeholders = items.map((it, idx) => {
      const base = idx * 8;
      values.push(ticketId, userId, lotteryCode, it.betType, it.number, it.amount, it.payoutRate ?? null, drawDate);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, 'pending', FALSE, $${base + 8})`;
    });
    const { rows: logs } = await client.query(
      `INSERT INTO purchase_logs (ticket_id, user_id, lottery_code, bet_type, numbers, amount, payout_rate, status, paid, draw_date)
       VALUES ${placeholders.join(", ")}
       RETURNING id`,
      values
    );
    const creditLimit = Number(updated[0].credit_limit ?? 0);
    const creditUsed = Number(updated[0].credit_used ?? 0);
    return {
      ticketId: String(ticketId),
      createdAt: tickets[0].created_at,
      itemIds: logs.map((row) => String(row.id)),
      creditLimit,
      creditUsed,
      creditAvailable: creditLimit - creditUsed
    };
  });
}

// ยกเลิกโพยที่ยังรอผล + คืนเครดิต (กันคืนซ้ำด้วย row lock)
export async function cancelPendingTicket(ticketId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query("SELECT id, user_id, amount, status FROM tickets WHERE id = $1 FOR UPDATE", [ticketId]);
    if (!rows.length) throw businessError("NOT_FOUND", "ไม่พบโพย");
    if (rows[0].status !== "pending") throw businessError("NOT_PENDING", "โพยนี้ไม่สามารถยกเลิกได้");
    const { rows: paid } = await client.query(
      "SELECT 1 FROM purchase_logs WHERE ticket_id = $1 AND (paid = TRUE OR status = 'won') LIMIT 1",
      [ticketId]
    );
    if (paid.length) throw businessError("NOT_PENDING", "โพยนี้มีรายการที่จ่ายรางวัลแล้ว");
    const refund = Number(rows[0].amount ?? 0);
    await client.query("UPDATE tickets SET status = 'cancelled' WHERE id = $1", [ticketId]);
    await client.query("UPDATE purchase_logs SET status = 'cancelled' WHERE ticket_id = $1", [ticketId]);
    await client.query("UPDATE users SET credit_limit = credit_limit + $2 WHERE id = $1", [rows[0].user_id, refund]);
    return { ticketId: String(ticketId), userId: rows[0].user_id, refund };
  });
}

function mapSettleItem(row) {
  return {
    id: String(row.id),
    betType: row.bet_type,
    number: String(row.numbers ?? "").trim(),
    amount: Number(row.amount ?? 0),
    payoutRate: row.payout_rate != null ? Number(row.payout_rate) : null,
    payoutAmount: row.payout_amount != null ? Number(row.payout_amount) : null,
    status: row.status ?? "pending",
    paid: row.paid === true
  };
}

// ตัดสินผลรายรายการของโพย 1 ใบในธุรกรรมเดียว: อัปเดตรายการ, สถานะโพย และเติมเครดิตผู้ชนะ
// decide(item) -> null (ไม่แตะ) | { status: "won", rate } | { status: "lost" } | { status: "pending", reason }
// รายการที่จ่ายแล้ว (paid) จะไม่ถูกจ่ายซ้ำหรือย้อนสถานะ
export async function settleTicketItems(ticketId, { decide, allowSettled = false }) {
  return withTransaction(async (client) => {
    const { rows: ticketRows } = await client.query(
      `SELECT t.id, t.user_id, u.username, t.lottery_code, t.bet_type, t.numbers, t.amount, t.payout_rate, t.status, t.draw_date
         FROM tickets t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = $1
        FOR UPDATE OF t`,
      [ticketId]
    );
    const ticket = ticketRows[0];
    if (!ticket || ticket.status === "cancelled") return null;
    if (!allowSettled && ticket.status !== "pending") return null;

    const loadItems = () =>
      client.query(
        "SELECT id, bet_type, numbers, amount, payout_rate, payout_amount, status, paid FROM purchase_logs WHERE ticket_id = $1 ORDER BY id FOR UPDATE",
        [ticketId]
      );
    let { rows: logRows } = await loadItems();
    if (!logRows.length) {
      // โพยรุ่นเก่าที่ไม่มีรายการย่อย: แตกเป็นรายการตามเลข แบ่งยอดเท่าๆ กัน
      const numbers = normalizeNumberList(ticket.numbers);
      const perItem = numbers.length ? Number(ticket.amount ?? 0) / numbers.length : 0;
      for (const number of numbers) {
        await client.query(
          `INSERT INTO purchase_logs (ticket_id, user_id, lottery_code, bet_type, numbers, amount, payout_rate, status, paid, draw_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', FALSE, $8)`,
          [ticketId, ticket.user_id, ticket.lottery_code, ticket.bet_type, String(number), perItem, ticket.payout_rate, ticket.draw_date]
        );
      }
      ({ rows: logRows } = await loadItems());
    }

    const items = logRows.map(mapSettleItem);
    let payout = 0;
    for (const item of items) {
      const decision = decide(item, ticket);
      if (!decision) continue;
      if (decision.status === "won") {
        if (item.paid) continue;
        const amount = roundMoney(item.amount * Number(decision.rate));
        await client.query(
          "UPDATE purchase_logs SET status = 'won', payout_rate = $2, payout_amount = $3, paid = TRUE, settled_at = NOW() WHERE id = $1",
          [item.id, decision.rate, amount]
        );
        Object.assign(item, { status: "won", payoutRate: Number(decision.rate), payoutAmount: amount, paid: true });
        payout += amount;
      } else if (decision.status === "lost") {
        if (item.paid) continue;
        await client.query("UPDATE purchase_logs SET status = 'lost', payout_amount = 0, settled_at = NOW() WHERE id = $1", [item.id]);
        Object.assign(item, { status: "lost", payoutAmount: 0 });
      } else if (decision.reason) {
        item.reason = decision.reason;
      }
    }

    const hasPending = items.some((it) => !it.status || it.status === "pending");
    const hasWon = items.some((it) => it.status === "won");
    const status = hasPending ? "pending" : hasWon ? "won" : "lost";
    const totalPaid = roundMoney(items.reduce((sum, it) => sum + (it.status === "won" ? Number(it.payoutAmount ?? 0) : 0), 0));
    await client.query("UPDATE tickets SET status = $2, payout_amount = $3 WHERE id = $1", [ticketId, status, totalPaid]);
    if (payout > 0) {
      await client.query("UPDATE users SET credit_limit = credit_limit + $2 WHERE id = $1", [ticket.user_id, roundMoney(payout)]);
    }
    return {
      ticketId: String(ticketId),
      userId: ticket.user_id,
      username: ticket.username,
      lotteryCode: ticket.lottery_code,
      status,
      amount: Number(ticket.amount ?? 0),
      payout: roundMoney(payout),
      totalPaid,
      items
    };
  });
}

export async function listPendingTicketIdsForDraw(lotteryCode, drawDate) {
  if (!pool) return [];
  const { rows } = await pool.query(
    "SELECT id FROM tickets WHERE lottery_code = $1 AND draw_date = $2 AND status = 'pending' ORDER BY id",
    [lotteryCode, drawDate]
  );
  return rows.map((row) => String(row.id));
}

export async function countSettledTicketsForDraw(lotteryCode, drawDate) {
  if (!pool) return 0;
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM tickets WHERE lottery_code = $1 AND draw_date = $2 AND status IN ('won', 'lost')",
    [lotteryCode, drawDate]
  );
  return Number(rows[0]?.count ?? 0);
}

// งวดที่มีโพยรอผล แต่ยังไม่มีผลในระบบ (ถึงวันออกรางวัลแล้ว)
export async function listDrawDatesAwaitingResult(lotteryCode, uptoDate) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT t.draw_date
       FROM tickets t
       LEFT JOIN lottery_results r ON r.lottery_code = t.lottery_code AND r.draw_date = t.draw_date
      WHERE t.lottery_code = $1 AND t.status = 'pending' AND t.draw_date <= $2 AND r.id IS NULL
      ORDER BY t.draw_date`,
    [lotteryCode, uptoDate]
  );
  return rows.map((row) => row.draw_date);
}

// งวดที่มีผลแล้วแต่ยังมีโพยค้างตรวจ
export async function listDrawDatesWithPendingTickets(lotteryCode) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT t.draw_date
       FROM tickets t
       JOIN lottery_results r ON r.lottery_code = t.lottery_code AND r.draw_date = t.draw_date
      WHERE t.lottery_code = $1 AND t.status = 'pending'
      ORDER BY t.draw_date`,
    [lotteryCode]
  );
  return rows.map((row) => row.draw_date);
}
