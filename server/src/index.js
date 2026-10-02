import { mountClient } from "./services/serveClient.js";
import { requestTestWithdrawal, decideTestTransaction, validAmount } from "./services/testWallet.js";
import { SettingsStore } from "./services/settingsStore.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { SecurityStore, hashPassword, verifyPassword, isLegacyHash, validPassword } from "./services/security.js";
import multer from "multer";
import { nanoid } from "nanoid";
import { lotteries, users, announcements, purchaseHistory, defaultResults } from "./data.js";
import { pool, testConnection } from "./db.js";
import {
  hasDatabase,
  createUserAccount,
  updateUserCredit,
  updateUserPassword,
  saveTicketRecord,
  logPurchase,
  fetchPurchaseLogs,
  fetchNumberSummaryForDraw,
  fetchNumberSummaryForRange,
  fetchPayoutRates,
  replacePayoutRates,
  listUsers,
  fetchCreditSummary,
  findUserWithSecret,
  ensureSuperAdmin,
  seedInitialData,
  listNumberRestrictions,
  createNumberRestriction,
  deleteNumberRestriction,
  fetchLatestResults,
  upsertLotteryResult,
  createNotification,
  fetchNotifications,
  fetchTicketById,
  markTicketResult,
  recalcTicketStatusFromItems,
  markNotificationRead,
  countOpenLotteries,
  sumTicketAmount,
  fetchLedger,
  fetchDailyTicketSummary,
  fetchIncomeReportFromDb,
  fetchUserProfile,
  upsertUserProfile,
  recordTransaction,
  listTransactions,
  recordAuditLog,
  listAuditLogs,
  listPromotions,
  fetchLotteryRounds,
  upsertLotteryRounds,
  getLiveSetting,
  setLiveSetting,
  appendChatMessage,
  listChatMessages,
  listChatThreads,
  upsertLottery,
  applyPayoutToUser,
  fetchPurchaseLogsByTicket,
  markPurchaseLogsStatus,
  ensureSchemaUpgrades,
  createTicketWithItems,
  cancelPendingTicket,
  settleTicketItems,
  fetchResultForDraw,
  countSettledTicketsForDraw
} from "./repositories/managementRepository.js";
import { evaluateTicketsForDraw } from "./services/evaluateTickets.js";
import { syncThaiLottoFromApi, startThaiResultScheduler } from "./services/thaiLottoSync.js";
import {
  BET_TYPE_LABELS,
  MAX_RTP,
  bangkokDate,
  computeRtp,
  findRestriction,
  isIsoDate,
  isKnownBetType,
  isValidBetNumber,
  isWinningBet,
  canSettleBetType,
  resolveOpenDraw,
  resolveWinningNumbers,
  withRtp
} from "./services/lottoRules.js";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
// ข้อมูลจำลอง (ผู้ใช้ demo, ผลรางวัล demo) ปิดอัตโนมัติใน production
const seedDemoData = process.env.SEED_DEMO_DATA ? process.env.SEED_DEMO_DATA === "true" : !isProduction;

const superAdminConfig = {
  username: process.env.SUPERADMIN_USERNAME || "superadmin",
  password: process.env.SUPERADMIN_PASSWORD || "Sup3rDemo!",
  passwordFromEnv: Boolean(process.env.SUPERADMIN_PASSWORD),
  creditLimit: Number(process.env.SUPERADMIN_CREDIT_LIMIT || 500000)
};
if (!superAdminConfig.passwordFromEnv) {
  if (isProduction) throw new Error("SUPERADMIN_PASSWORD is required in production");
  console.warn("⚠️  SUPERADMIN_PASSWORD ไม่ได้ตั้งค่า: บัญชี superadmin ใหม่จะใช้รหัสผ่านเริ่มต้น ให้ตั้งค่าใน .env ก่อนขึ้น production");
}

const DEMO_AGENT_PASSWORD = process.env.DEMO_AGENT_PASSWORD || "AgentDemo123!";
const demoAgentPasswordHash = await hashPassword(DEMO_AGENT_PASSWORD);
const superAdminPasswordHash = await hashPassword(superAdminConfig.password);

const lotteryKindOf = (code) => (code.startsWith("lao") ? "lao" : code.startsWith("viet") ? "viet" : "thai");

const lotterySeeds = lotteries.map((item) => ({
  code: item.id,
  name: item.name,
  kind: lotteryKindOf(item.id),
  openTime: item.openTime,
  closeTime: item.closeTime,
  status: item.status,
  description: item.description
}));

const userSeeds = !seedDemoData ? [] : [
  ...users
    .filter((user) => user.role !== "admin")
    .map((user) => ({
      username: user.username,
      role: user.role ?? "agent",
      creditLimit: user.creditLimit,
      creditUsed: user.creditUsed,
      passwordHash: demoAgentPasswordHash
    })),
  {
    username: "agentdemo",
    role: "agent",
    creditLimit: 80000,
    creditUsed: 15000,
    passwordHash: demoAgentPasswordHash
  }
];

function normalizeNumberList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value;
  }
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

const fallbackTransactions = [];
const fallbackAuditLogs = [];
const fallbackChatThreads = new Map();
let fallbackLiveEnabled = true;
const fallbackProfiles = new Map();
const highlightSeed = {
  thai: {
    three: ["145", "908", "672"],
    two: ["50", "90", "12"]
  },
  lao: {
    three: ["901", "228", "443"],
    two: ["35", "77", "10"]
  }
};
const fallbackPromotions = [
  { code: "STANDARD", title: "ราคาปกติ", description: "จ่ายเต็มทุกประเภท", discount_percent: 0 },
  { code: "DISCOUNT30", title: "ลด 30%", description: "ลดต้นทุนโพย 30% สำหรับช่วงโปรโมชัน", discount_percent: 30 }
];

function appendFallbackChatMessage(username, sender, message) {
  const thread = fallbackChatThreads.get(username) || [];
  const record = { id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`, sender, message, created_at: new Date().toISOString() };
  thread.push(record);
  fallbackChatThreads.set(username, thread);
  return record;
}

function getFallbackChatHistory(username) {
  return fallbackChatThreads.get(username) || [];
}

const CANCEL_WINDOW_MINUTES = 30;

function findLottery(code) {
  return lotteries.find((l) => l.id === code || l.code === code) ?? null;
}

// cache ตารางงวดพิเศษจาก lottery_rounds (เช่น งวด 17 ม.ค. / 2 พ.ค. / 30 ธ.ค.)
const roundsCache = new Map();
async function loadRounds(code) {
  if (!hasDatabase()) return null;
  const cached = roundsCache.get(code);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.rounds;
  const rounds = await fetchLotteryRounds(code).catch(() => null);
  roundsCache.set(code, { at: Date.now(), rounds });
  return rounds;
}

// งวดที่เปิดรับอยู่ ณ เวลา now (ยึดเวลาไทย) -> { drawDate, closeAt }
async function resolveCurrentDraw(code, now = new Date()) {
  const lottery = findLottery(code);
  if (!lottery) return null;
  return resolveOpenDraw({ code, closeTime: lottery.closeTime, rounds: await loadRounds(code), now });
}

function resolveDrawDateForLottery(lotteryId, createdAt) {
  if (!createdAt) return null;
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return null;
  const lottery = findLottery(lotteryId);
  return resolveOpenDraw({ code: lotteryId, closeTime: lottery?.closeTime, now: base })?.drawDate ?? bangkokDate(base);
}

function resolveLotteryCloseTime(lottery, drawDate) {
  if (!lottery?.closeTime) return null;
  const raw = String(lottery.closeTime);
  const match = raw.match(/T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/);
  const timePart = match?.[1] ?? "00:00";
  const offset = match?.[2] ?? "+07:00";
  if (!drawDate) {
    const direct = new Date(raw);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  const composed = new Date(`${drawDate}T${timePart}:00${offset}`);
  if (!Number.isNaN(composed.getTime())) return composed;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

async function resolveUsernameById(userId) {
  if (!userId) return null;
  if (hasDatabase()) {
    try {
      const { rows } = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
      return rows?.[0]?.username ?? null;
    } catch (err) {
      console.error("resolve username failed:", err.message || err);
    }
  }
  const fallbackUser = users.find((user) => String(user.id) === String(userId));
  return fallbackUser?.username ?? null;
}

async function appendAuditLogEntry({
  action,
  actorId,
  actorUsername,
  targetUserId,
  targetUsername,
  amount,
  txnType,
  status,
  note,
  transactionId
}) {
  const details = {
    actorUsername: actorUsername ?? null,
    targetUserId: targetUserId ?? null,
    targetUsername: targetUsername ?? null,
    amount: typeof amount === "number" ? amount : amount ?? null,
    txnType: txnType ?? null,
    status: status ?? null,
    note: note ?? null,
    transactionId: transactionId ?? null
  };
  if (hasDatabase()) {
    try {
      await recordAuditLog({ userId: actorId ?? null, action, details });
      return;
    } catch (err) {
      if (err.code !== "AUDIT_LOG_UNAVAILABLE") {
        console.error("record audit log failed:", err.message || err);
      }
    }
  }
  fallbackAuditLogs.unshift({
    id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    actorUsername: actorUsername ?? null,
    details,
    created_at: new Date().toISOString()
  });
}

function normalizeAuditEntry(entry) {
  let details = entry.details ?? {};
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = {};
    }
  }
  return {
    id: entry.id,
    action: entry.action,
    actorUsername: entry.actorUsername ?? details.actorUsername ?? null,
    targetUserId: details.targetUserId ?? null,
    targetUsername: details.targetUsername ?? null,
    amount: details.amount ?? null,
    txnType: details.txnType ?? null,
    status: details.status ?? null,
    note: details.note ?? null,
    transactionId: details.transactionId ?? null,
    createdAt: entry.created_at ?? entry.createdAt ?? null
  };
}

const payoutSeeds = {
  "th-lottery": [
    { betType: "three-top", rate: 950 },
    { betType: "three-tod", rate: 150 },
    { betType: "three-bottom", rate: 450 },
    { betType: "three-front", rate: 450 },
    { betType: "three-front-tod", rate: 75 },
    { betType: "two-top", rate: 95 },
    { betType: "two-bottom", rate: 95 },
    { betType: "run-top", rate: 3.2 },
    { betType: "run-bottom", rate: 4.2 }
  ],
  "gsb-lottery": [
    { betType: "three-top", rate: 950 },
    { betType: "three-tod", rate: 150 },
    { betType: "three-bottom", rate: 450 },
    { betType: "three-front", rate: 450 },
    { betType: "three-front-tod", rate: 75 },
    { betType: "two-top", rate: 95 },
    { betType: "two-bottom", rate: 95 },
    { betType: "run-top", rate: 3.2 },
    { betType: "run-bottom", rate: 4.2 }
  ],
  "baac-lottery": [
    { betType: "three-top", rate: 950 },
    { betType: "three-tod", rate: 150 },
    { betType: "three-bottom", rate: 450 },
    { betType: "three-front", rate: 450 },
    { betType: "three-front-tod", rate: 75 },
    { betType: "two-top", rate: 95 },
    { betType: "two-bottom", rate: 95 },
    { betType: "run-top", rate: 3.2 },
    { betType: "run-bottom", rate: 4.2 }
  ],
  "lao-lottery": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ],
  "lao-vip": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ],
  "lao-star": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ],
  "viet-standard": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ],
  "viet-special": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ],
  "viet-vip": [
    { betType: "three-top", rate: 850 },
    { betType: "three-tod", rate: 120 },
    { betType: "two-top", rate: 90 },
    { betType: "two-bottom", rate: 90 },
    { betType: "run-top", rate: 3.0 },
    { betType: "run-bottom", rate: 4.0 }
  ]
};

function hydrateTicketsWithResults(items, resultsMap = {}) {
  const betTypeLabelMap = {
    "three-top": "3 ตัวบน",
    "three-tod": "3 ตัวโต๊ด",
    "three-bottom": "3 ตัวล่าง",
    "three-front": "3 หัว",
  "three-front-tod": "3 หัวโต๊ด",
  "two-top": "2 ตัวบน",
  "two-bottom": "2 ตัวล่าง",
  "run-top": "วิ่งบน",
  "run-bottom": "วิ่งล่าง",
  standard: "สองตัว · 2 ตัวบน"
  };
  return (items || []).map((item) => {
    const numbers = normalizeNumberList(item.numbers ?? item.betNumbers);
    const ticketItems =
      Array.isArray(item.items) && item.items.length
        ? item.items
        : numbers.map((num) => ({
            id: `${item.id}-${num}`,
            number: num,
            amount: item.amount ? Number(item.amount) / numbers.length : Number(item.debit ?? 0) / numbers.length,
            betType: item.betType || "standard",
            betTypeLabel: item.betTypeLabel || betTypeLabelMap[item.betType] || betTypeLabelMap.standard
          }));
    const isWinner = item.status === "won";
    const creditValue = isWinner ? item.credit ?? item.potentialPayout ?? item.amount ?? 0 : item.credit ?? 0;
    return {
      ...item,
      numbers,
      items: ticketItems,
      status: isWinner ? "won" : item.status || "pending",
      credit: creditValue
    };
  });
}

// ตรวจเรทจ่าย: ต้องเป็นประเภทที่รู้จัก, เรท >= 0 และ RTP ไม่เกิน 100% (กันเจ้ามือขาดทุนเชิงคณิตศาสตร์)
function validatePayoutRates(rates) {
  const errors = [];
  for (const item of rates) {
    if (!isKnownBetType(item?.betType)) {
      errors.push(`ไม่รู้จักประเภท ${item?.betType}`);
      continue;
    }
    const rate = Number(item.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      errors.push(`${BET_TYPE_LABELS[item.betType]}: เรทไม่ถูกต้อง`);
      continue;
    }
    const rtp = computeRtp(item.betType, rate);
    if (rtp != null && rtp > MAX_RTP) {
      errors.push(`${BET_TYPE_LABELS[item.betType]} เรท ${rate} คืนผู้เล่น ${(rtp * 100).toFixed(1)}% (เกิน 100% เจ้ามือขาดทุน)`);
    }
  }
  return errors;
}

async function warnUnbalancedRates() {
  for (const lottery of lotteries) {
    const rows = await fetchPayoutRates(lottery.id).catch(() => []);
    const errors = validatePayoutRates(rows);
    if (errors.length) console.warn(`⚠️  เรทจ่าย ${lottery.id} ไม่สมดุล: ${errors.join("; ")}`);
  }
}

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
mountClient(app);

// Multer for handling multipart form-data (e.g. deposit slip uploads). Memory storage for now.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } });

const sessionTtl = Number(process.env.SESSION_TTL_HOURS || 8);
if (!Number.isFinite(sessionTtl) || sessionTtl <= 0) throw new Error("Invalid SESSION_TTL_HOURS");
const sessions = new SecurityStore(pool, { ttlMs: sessionTtl * 3600000 });
await sessions.init();
setInterval(() => sessions.cleanup().catch(console.error), 60000).unref();
const fallbackPasswords = new Map();

// Runtime cache refreshed from PostgreSQL settings on API requests.
const appSettings = {
  autoCloseBeforeMinutes: 15,
  defaultMinBet: 5,
  defaultMaxBet: 20000,
  allowedCurrencies: ["THB"],
  maintenanceMode: false,
  depositNotice: "ติดต่อ Admin ของระบบเพื่อยืนยันการฝาก",
  depositLineUrl: ""
};

const settingsStore = new SettingsStore(pool);
await settingsStore.init();
await settingsStore.load(lotteries, appSettings);

if (pool) {
  await (async () => {
    try {
      await testConnection();
      console.log("✅ Database connection pool initialized");
      await ensureSchemaUpgrades();
      if (superAdminConfig.username && superAdminPasswordHash) {
        const result = await ensureSuperAdmin({
          username: superAdminConfig.username,
          passwordHash: superAdminPasswordHash,
          creditLimit: superAdminConfig.creditLimit,
          resetPassword: process.env.SUPERADMIN_RESET_PASSWORD === "true"
        });
        if (result) {
          if (process.env.SUPERADMIN_RESET_PASSWORD === "true") await sessions.revokeUser(result.id);
          console.log(`👑 Super admin '${result.username}' พร้อมใช้งาน (id: ${result.id})`);
        }
      }
      await seedInitialData({
        lotteriesSeed: lotterySeeds,
        usersSeed: userSeeds,
        payoutSeed: payoutSeeds,
        resultsSeed: seedDemoData ? defaultResults : {}
      });
      console.log(seedDemoData ? "📦 เตรียมข้อมูลทดสอบเรียบร้อย" : "📦 ตรวจข้อมูลตั้งต้นเรียบร้อย (ไม่ใส่ข้อมูล demo)");
      await warnUnbalancedRates();
      if (process.env.THAI_SYNC_AUTO !== "false") {
        startThaiResultScheduler();
        console.log("⏱️  เปิดตัวดึงผลหวยไทยอัตโนมัติ (GLO)");
      }
    } catch (err) {
      throw err;
    }
  })();
} else {
  if (isProduction) throw new Error("Database configuration is required in production");
  console.warn("ℹ️  Database connection disabled (configuration missing)");
}

// เส้นทางที่เปิดให้ดูได้โดยไม่ต้องเข้าสู่ระบบ
const PUBLIC_ROUTES = [
  /^\/api\/health\/db$/,
  /^\/api\/lotteries(\/[^/]+(\/(payout-rates|restrictions))?)?$/,
  /^\/api\/lottery-results\/latest$/,
  /^\/api\/lottery-rounds\/[^/]+$/,
  /^\/api\/highlights$/,
  /^\/api\/promotions$/
];
// /api/admin/* ที่สมาชิกทั่วไปเรียกได้ (endpoint กรองข้อมูลเฉพาะของตัวเอง)
const MEMBER_SCOPED_ADMIN_ROUTES = [/^\/api\/admin\/(summary|credit-ledger|credit-between|daily-summary|settings)$/];

app.use(async (req, res, next) => {
  try {
  if (req.path.startsWith("/api/auth")) return next();
  const token = req.header("x-session-token");
  const session = token ? await sessions.get(token) : null;
  req.session = session ?? null;
  await settingsStore.load(lotteries, appSettings);

  if (req.method === "GET" && PUBLIC_ROUTES.some((re) => re.test(req.path))) return next();
  if (!session) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  }
  if (req.path.startsWith("/api/admin")) {
    const memberAllowed = req.method === "GET" && MEMBER_SCOPED_ADMIN_ROUTES.some((re) => re.test(req.path));
    if (session.role !== "admin" && !memberAllowed) {
      return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
    }
  }
  next();
  } catch (err) { next(err); }
});

app.get("/api/health/db", async (req, res) => {
  try {
    await testConnection();
    res.json({ status: "ok" });
  } catch (error) {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Admin endpoints: get / update per-lottery round mappings
app.get('/api/admin/lottery-rounds/:lotteryCode', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ message: 'ต้องเป็นผู้ดูแลระบบ' });
  const { lotteryCode } = req.params;
  if (!lotteryCode) return res.status(400).json({ message: 'ระบุ lotteryCode' });
  if (!hasDatabase()) return res.status(400).json({ message: 'DB not enabled' });
  try {
    const rounds = await fetchLotteryRounds(lotteryCode);
    return res.json({ success: true, rounds });
  } catch (err) {
    console.error('fetchLotteryRounds failed:', err);
    return res.status(500).json({ message: 'ไม่สามารถดึงการตั้งค่าวงรอบได้' });
  }
});

// Public read endpoint for lottery round mappings (used by client display)
app.get('/api/lottery-rounds/:lotteryCode', async (req, res) => {
  const { lotteryCode } = req.params;
  if (!lotteryCode) return res.status(400).json({ message: 'ระบุ lotteryCode' });
  if (hasDatabase()) {
    try {
      const rounds = await fetchLotteryRounds(lotteryCode);
      return res.json({ success: true, rounds });
    } catch (err) {
      console.error('fetchLotteryRounds(public) failed:', err);
      return res.status(500).json({ message: 'ไม่สามารถดึงการตั้งค่าวงรอบได้' });
    }
  }
  return res.json({ success: true, rounds: [] });
});

app.post('/api/admin/lottery-rounds/:lotteryCode', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ message: 'ต้องเป็นผู้ดูแลระบบ' });
  const { lotteryCode } = req.params;
  const { rounds } = req.body;
  if (!lotteryCode) return res.status(400).json({ message: 'ระบุ lotteryCode' });
  if (!Array.isArray(rounds)) return res.status(400).json({ message: 'rounds ต้องเป็นอาเรย์' });
  if (!hasDatabase()) return res.status(400).json({ message: 'DB not enabled' });
  try {
    await upsertLotteryRounds(lotteryCode, rounds);
    roundsCache.delete(lotteryCode);
    return res.json({ success: true });
  } catch (err) {
    console.error('upsertLotteryRounds failed:', err);
    return res.status(500).json({ message: 'ไม่สามารถบันทึกการตั้งค่าวงรอบได้' });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !username || username.length > 100 || typeof password !== "string" || !password || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ message: "ต้องกรอก username และ password" });
  }

  try {
    let profile = null;
    const retry = await sessions.attempt(`ip:${req.ip}`, 100) || await sessions.attempt(`user:${username}`, 10);
    if (retry) return res.set('Retry-After', String(retry)).status(429).json({ message: "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่" });

    if (hasDatabase()) {
      const dbUser = await findUserWithSecret(username);
      if (dbUser && await verifyPassword(password, dbUser.password_hash)) {
        if (isLegacyHash(dbUser.password_hash)) {
          // Legacy short passwords remain usable but are immediately rehashed.
          const { default: bcrypt } = await import("bcryptjs");
          await updateUserPassword(dbUser.id, await bcrypt.hash(password, 12));
        }
        profile = {
          id: dbUser.id,
          username: dbUser.username,
          role: dbUser.role,
          creditLimit: Number(dbUser.credit_limit ?? 0),
          creditUsed: Number(dbUser.credit_used ?? 0)
        };
      } else {
        return res.status(401).json({ message: "ไม่พบผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }
    } else {
      if (username === superAdminConfig.username && await verifyPassword(password, fallbackPasswords.get(username) || superAdminPasswordHash)) {
        profile = {
          id: 0,
          username: superAdminConfig.username,
          role: "admin",
          creditLimit: superAdminConfig.creditLimit,
          creditUsed: 0
        };
      } else {
        const demoUser = users.find((u) => u.username === username);
        if (!seedDemoData || !demoUser || !await verifyPassword(password, fallbackPasswords.get(username) || demoAgentPasswordHash)) {
          return res.status(401).json({ message: "ไม่พบผู้ใช้" });
        }
        profile = {
          id: demoUser.id,
          username: demoUser.username,
          role: demoUser.role,
          creditLimit: demoUser.creditLimit,
          creditUsed: demoUser.creditUsed
        };
      }
    }

    const token = await sessions.create({ username: profile.username, role: profile.role, userId: profile.id });

    res.json({ token, profile });
  } catch (err) {
    console.error("login failed:", err);
    res.status(500).json({ message: "ไม่สามารถเข้าสู่ระบบได้" });
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
  const token = req.header("x-session-token") || req.body?.token;
  if (token) {
    await sessions.delete(token);
  }
  res.json({ message: "ออกจากระบบเรียบร้อย" });
  } catch (err) { next(err); }
});

app.get("/api/profile", async (req, res) => {
  if (req.session?.guest) {
    return res.json({
      id: 0,
      username: req.session.username || "demo-admin",
      role: req.session.role || "admin",
      creditLimit: 0,
      creditUsed: 0,
      creditAvailable: 0,
      guest: true,
      account: null
    });
  }
  if (hasDatabase()) {
    try {
      const dbUser = await findUserWithSecret(req.session.username);
      if (!dbUser) {
        return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
      }
      const profile = await fetchUserProfile(dbUser.id);
      return res.json({
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role,
        creditLimit: Number(dbUser.credit_limit ?? 0),
        creditUsed: Number(dbUser.credit_used ?? 0),
        creditAvailable: Number(dbUser.credit_limit ?? 0) - Number(dbUser.credit_used ?? 0),
        account: profile
      });
    } catch (err) {
      console.error("profile failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงข้อมูลผู้ใช้ได้" });
    }
  }
  const mockUser = users.find((u) => u.username === req.session.username);
  if (mockUser) {
    const storedProfile = fallbackProfiles.get(mockUser.username) || {
      full_name: "Demo User",
      bank_name: "HSBC",
      bank_account: "61727-9090",
      bsb: "342252",
      registration_no: "XX-123456"
    };
    return res.json({
      id: mockUser.id,
      username: mockUser.username,
      role: mockUser.role,
      creditLimit: mockUser.creditLimit,
      creditUsed: mockUser.creditUsed,
      creditAvailable: mockUser.creditLimit - mockUser.creditUsed,
      account: storedProfile
    });
  }
  res.json({
    username: req.session.username,
    role: req.session.role || "agent",
    creditLimit: 0,
    creditUsed: 0,
    creditAvailable: 0,
    account: null
  });
});

// Minimal credit info for the logged-in user
app.get("/api/me/credit", async (req, res) => {
  if (req.session?.guest) {
    return res.json({
      creditLimit: 0,
      creditUsed: 0,
      creditAvailable: 0,
      guest: true
    });
  }
  if (hasDatabase()) {
    try {
      const dbUser = await findUserWithSecret(req.session.username);
      if (!dbUser) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
      const creditLimit = Number(dbUser.credit_limit ?? 0);
      const creditUsed = Number(dbUser.credit_used ?? 0);
      const creditAvailable = creditLimit - creditUsed;
      return res.json({ creditLimit, creditUsed, creditAvailable });
    } catch (err) {
      console.error("me/credit failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงข้อมูลเครดิตได้" });
    }
  }
  const mockUser = users.find((u) => u.username === req.session.username);
  if (mockUser) {
    const creditLimit = Number(mockUser.creditLimit ?? 0);
    const creditUsed = Number(mockUser.creditUsed ?? 0);
    const creditAvailable = creditLimit - creditUsed;
    return res.json({ creditLimit, creditUsed, creditAvailable });
  }
  res.json({ creditLimit: 0, creditUsed: 0, creditAvailable: 0 });
});

// demo fallback notifications store
const fallbackNotifications = new Map();


app.put("/api/profile", async (req, res) => {
  if (req.session?.guest) {
    return res.status(403).json({ message: "โหมดสาธิตไม่สามารถแก้ไขข้อมูลได้" });
  }
  if (!req.session?.userId) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบอีกครั้ง" });
  }
  if (hasDatabase()) {
    try {
      const profile = await upsertUserProfile(req.session.userId, {
        fullName: req.body.fullName,
        bankName: req.body.bankName,
        bankAccount: req.body.bankAccount,
        bankBranch: req.body.bankBranch,
        bsb: req.body.bsb,
        registrationNo: req.body.registrationNo,
        phone: req.body.phone
      });
      return res.json({ message: "บันทึกข้อมูลสำเร็จ", profile });
    } catch (err) {
      console.error("update profile failed:", err);
      return res.status(500).json({ message: "ไม่สามารถบันทึกข้อมูลได้" });
    }
  }
  const payload = {
    full_name: req.body?.fullName ?? null,
    bank_name: req.body?.bankName ?? null,
    bank_account: req.body?.bankAccount ?? null,
    bank_branch: req.body?.bankBranch ?? null,
    bsb: req.body?.bsb ?? null,
    registration_no: req.body?.registrationNo ?? null,
    phone: req.body?.phone ?? null
  };
  fallbackProfiles.set(req.session.username, payload);
  res.json({ message: "โหมดสาธิต: จำลองการบันทึกสำเร็จ", profile: payload });
});

app.post("/api/profile/password", async (req, res, next) => {
  try {
    const { password, currentPassword } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์" });
    const retry = await sessions.attempt(`password:${req.session.username}`, 10);
    if (retry) return res.set('Retry-After', String(retry)).status(429).json({ message: "กรุณารอก่อนลองอีกครั้ง" });
    const user = pool ? await findUserWithSecret(req.session.username) : null;
    const stored = pool ? user?.password_hash : fallbackPasswords.get(req.session.username) || (req.session.role === 'admin' ? superAdminPasswordHash : demoAgentPasswordHash);
    if (!await verifyPassword(currentPassword, stored)) return res.status(403).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    const hash = await hashPassword(password);
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.session.userId, hash]);
        await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [req.session.userId]);
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); throw err; }
      finally { client.release(); }
    } else {
      fallbackPasswords.set(req.session.username, hash);
      await sessions.revokeUser(req.session.userId);
    }
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่" });
  } catch (err) { next(err); }
});

app.get("/api/promotions", async (req, res) => {
  if (hasDatabase()) {
    try {
      const promos = await listPromotions();
      return res.json(promos);
    } catch (err) {
      console.error("promotions failed:", err);
    }
  }
  res.json(fallbackPromotions);
});

app.get("/api/live", async (req, res) => {
  if (hasDatabase()) {
    try {
      const enabled = await getLiveSetting();
      return res.json({ enabled });
    } catch (err) {
      console.error("live status failed:", err);
    }
  }
  res.json({ enabled: fallbackLiveEnabled });
});

app.get("/api/wallet/transactions", async (req, res) => {
  if (req.session?.guest) return res.json([]);
  if (hasDatabase()) {
    try {
      const rows = await listTransactions({ userId: req.session.userId, limit: 100 });
      return res.json(rows);
    } catch (err) {
      if (err.code !== "TRANSACTIONS_UNAVAILABLE") {
        console.error("transactions failed:", err);
      }
    }
  }
  const records = fallbackTransactions.filter((txn) => txn.username === req.session.username).slice(-100).reverse();
  res.json(records);
});

// optional multipart parser for deposit (handles FormData with "slip")
const depositUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return upload.single("slip")(req, res, next);
  }
  return next();
};

app.post("/api/wallet/deposit", depositUpload, async (req, res) => {
  if (req.session?.guest) return res.status(403).json({ message: "โหมดสาธิต" });
  const amount = Number(req.body?.amount ?? 0);
  if (!validAmount(amount)) {
    return res.status(400).json({ message: "จำนวนเงินไม่ถูกต้อง" });
  }
  const note = req.body?.note ?? "";
  if (hasDatabase()) {
    try {
      const record = await recordTransaction({ userId: req.session.userId, type: "deposit", amount, note });
      return res.status(201).json(record);
    } catch (err) {
      if (err.code === "TRANSACTIONS_UNAVAILABLE") {
        console.warn("transactions table unavailable, using fallback deposit log");
      } else {
      console.error("deposit request failed:", err);
        return res.status(500).json({ message: "ไม่สามารถส่งคำขอฝากได้" });
      }
    }
  }
  fallbackTransactions.push({
    id: `demo-${Date.now()}`,
    username: req.session.username,
    txn_type: "deposit",
    status: "pending",
    amount,
    note,
    created_at: new Date().toISOString()
  });
  res.status(201).json({ message: "บันทึกคำขอฝาก (สาธิต)" });
});

app.post("/api/wallet/withdraw", async (req, res) => {
  if (req.session?.guest) return res.status(403).json({ message: "โหมดสาธิต" });
  const amount = Number(req.body?.amount ?? 0);
  if (!validAmount(amount)) {
    return res.status(400).json({ message: "จำนวนเงินไม่ถูกต้อง" });
  }
  const userNote = (req.body?.note || "").trim();
  const note = userNote || null;
  if (hasDatabase()) {
    try {
      const record = await requestTestWithdrawal(pool, req.session.userId, amount, note);
      return res.status(201).json(record);
    } catch (err) {
      console.error("withdraw request failed:", err);
      return res.status(err.status || 500).json({ message: err.status ? err.message : "ไม่สามารถส่งคำขอถอนได้" });
    }
  }
  // fallback mode
  const demoUser = users.find((u) => u.username === req.session.username);
  if (!demoUser) return res.status(400).json({ message: "ไม่พบผู้ใช้" });
  const available = Number(demoUser.creditLimit ?? 0) - Number(demoUser.creditUsed ?? 0);
  if (amount > available) {
    return res.status(400).json({ message: "เครดิตไม่เพียงพอ" });
  }
  // lock credit
  demoUser.creditLimit = Number(demoUser.creditLimit ?? 0) - amount;
  fallbackTransactions.push({
    id: `demo-${Date.now()}`,
    username: req.session.username,
    txn_type: "withdraw",
    status: "pending",
    amount,
    note,
    created_at: new Date().toISOString()
  });
  res.status(201).json({ message: "บันทึกคำขอถอน (สาธิต)" });
});

app.get("/api/highlights", (req, res) => {
  res.json(highlightSeed);
});

app.get("/api/chat", async (req, res) => {
  if (req.session?.guest) return res.json([]);
  if (hasDatabase()) {
    try {
      const rows = await listChatMessages(req.session.userId);
      return res.json(rows);
    } catch (err) {
      if (err.code !== "CHAT_TABLE_UNAVAILABLE") {
        console.error("chat list failed:", err);
        return res.status(500).json({ message: "ไม่สามารถดึงประวัติแชทได้" });
      }
    }
  }
  res.json(getFallbackChatHistory(req.session.username));
});

app.post("/api/chat", async (req, res) => {
  if (req.session?.guest) return res.status(403).json({ message: "โหมดสาธิต" });
  const message = (req.body?.message || "").trim();
  if (!message) return res.status(400).json({ message: "กรุณากรอกข้อความ" });
  if (hasDatabase()) {
    try {
      const record = await appendChatMessage({ userId: req.session.userId, sender: "user", message });
      return res.status(201).json(record);
    } catch (err) {
      if (err.code !== "CHAT_TABLE_UNAVAILABLE") {
        console.error("chat append failed:", err);
        return res.status(500).json({ message: "ไม่สามารถส่งข้อความได้" });
      }
    }
  }
  const record = appendFallbackChatMessage(req.session.username, "user", message);
  res.status(201).json(record);
});

app.get("/api/admin/chat/threads", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  if (hasDatabase()) {
    try {
      const rows = await listChatThreads();
      return res.json(rows);
    } catch (err) {
      if (err.code !== "CHAT_TABLE_UNAVAILABLE") {
        console.error("chat threads failed:", err);
      }
      const demoThreads = Array.from(fallbackChatThreads.entries()).map(([username, messages]) => ({
        username,
        updated_at: messages.at(-1)?.created_at ?? null
      }));
      return res.json(demoThreads);
    }
  }
  const demoThreads = Array.from(fallbackChatThreads.entries()).map(([username, messages]) => ({
    username,
    updated_at: messages.at(-1)?.created_at ?? null
  }));
  res.json(demoThreads);
});

app.get("/api/admin/chat/:username", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  if (hasDatabase()) {
    try {
      const dbUser = await findUserWithSecret(req.params.username);
      if (!dbUser) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
      const rows = await listChatMessages(dbUser.id);
      return res.json(rows);
    } catch (err) {
      if (err.code !== "CHAT_TABLE_UNAVAILABLE") {
        console.error("chat detail failed:", err);
        return res.status(500).json({ message: "ไม่สามารถดึงแชทได้" });
      }
    }
  }
  res.json(getFallbackChatHistory(req.params.username));
});

app.post("/api/admin/chat/:username", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const message = (req.body?.message || "").trim();
  if (!message) return res.status(400).json({ message: "กรุณากรอกข้อความ" });
  if (hasDatabase()) {
    try {
      const dbUser = await findUserWithSecret(req.params.username);
      if (!dbUser) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
      const record = await appendChatMessage({ userId: dbUser.id, sender: "admin", message });
      return res.status(201).json(record);
    } catch (err) {
      if (err.code !== "CHAT_TABLE_UNAVAILABLE") {
        console.error("chat reply failed:", err);
        return res.status(500).json({ message: "ไม่สามารถส่งข้อความได้" });
      }
    }
  }
  const record = appendFallbackChatMessage(req.params.username, "admin", message);
  res.status(201).json(record);
});

app.post("/api/admin/live", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const enabled = Boolean(req.body?.enabled);
  if (hasDatabase()) {
    try {
      await setLiveSetting(enabled);
      return res.json({ enabled });
    } catch (err) {
      console.error("update live failed:", err);
      return res.status(500).json({ message: "ไม่สามารถอัปเดตสถานะไลฟ์ได้" });
    }
  }
  fallbackLiveEnabled = enabled;
  res.json({ enabled });
});

// แนบงวดปัจจุบันและเวลาปิดรับที่ server ใช้จริง ให้หน้าเว็บแสดงตรงกับ server
async function withCurrentDraw(lottery, now = new Date()) {
  const draw = await resolveCurrentDraw(lottery.id, now);
  return {
    ...lottery,
    currentDrawDate: draw?.drawDate ?? null,
    currentCloseAt: draw?.closeAt?.toISOString() ?? null
  };
}

app.get("/api/lotteries", async (req, res) => {
  const now = new Date();
  res.json(await Promise.all(lotteries.map((lottery) => withCurrentDraw(lottery, now))));
});

app.get("/api/lotteries/:id", async (req, res) => {
  const lottery = lotteries.find((l) => l.id === req.params.id);
  if (!lottery) {
    return res.status(404).json({ message: "ไม่พบหวยที่ต้องการ" });
  }
  res.json(await withCurrentDraw(lottery));
});

async function loadPayoutRates(lotteryCode) {
  if (!hasDatabase()) return payoutSeeds[lotteryCode] ?? [];
  return fetchPayoutRates(lotteryCode);
}

app.get("/api/lotteries/:id/payout-rates", async (req, res) => {
  try {
    const rows = await loadPayoutRates(req.params.id);
    res.json(withRtp(rows));
  } catch (err) {
    console.error("client payout failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงเรตจ่ายได้" });
  }
});

app.get("/api/lotteries/:id/restrictions", async (req, res) => {
  if (!hasDatabase()) {
    return res.json([]);
  }
  try {
    const rows = await listNumberRestrictions({ lotteryCode: req.params.id });
    res.json(rows);
  } catch (err) {
    console.error("client restrictions failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงเลขอั้นได้" });
  }
});

app.post("/api/admin/lotteries/:id/status", async (req, res, next) => {
  try {
    const lottery = lotteries.find((l) => l.id === req.params.id);
    if (!lottery) return res.status(404).json({ message: "ไม่พบหวยที่ต้องการ" });
    const patch = {};
    for (const key of ['status', 'openTime', 'closeTime', 'note', 'minBet', 'maxBet']) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.status && !['open','closed'].includes(patch.status)) return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
    for (const key of ['minBet','maxBet']) if (key in patch && (!Number.isFinite(patch[key]) || patch[key] <= 0)) return res.status(400).json({ message: 'วงเงินไม่ถูกต้อง' });
    for (const key of ['openTime','closeTime']) if (key in patch && !Number.isFinite(Date.parse(patch[key]))) return res.status(400).json({ message: 'เวลาไม่ถูกต้อง' });
    const saved = { ...lottery, ...patch };
    if (saved.maxBet < saved.minBet) return res.status(400).json({ message: 'วงเงินสูงสุดต่ำกว่าขั้นต่ำ' });
    await settingsStore.save(`lottery:${lottery.id}`, saved);
    Object.assign(lottery, saved);
    res.json(saved);
  } catch (err) { next(err); }
});

// Admin: create or update lottery definition
app.post("/api/admin/lotteries", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const payload = req.body || {};
  if (!payload.code || !payload.name) {
    return res.status(400).json({ message: "กรุณาระบุ code และ name" });
  }
  if (hasDatabase()) {
    try {
      const saved = await upsertLottery(payload);
      const existing = lotteries.find(l => l.id === payload.code);
      const definition = { ...existing, id: payload.code, name: payload.name, type: payload.kind || existing?.type || 'international', group: payload.group || existing?.group || 'อื่นๆ', status: saved.status, openTime: saved.openTime, closeTime: saved.closeTime, description: saved.description, minBet: existing?.minBet || 5, maxBet: existing?.maxBet || 10000 };
      await settingsStore.save(`lottery:${payload.code}`, definition);
      if (existing) Object.assign(existing, definition); else lotteries.push(definition);
      return res.status(201).json(saved);
    } catch (err) {
      console.error("upsert lottery failed:", err);
      return res.status(500).json({ message: "ไม่สามารถบันทึกหวยใหม่ได้" });
    }
  }
  // fallback mode: update in-memory seed
  const existing = lotteries.find((l) => l.id === payload.code);
  if (existing) {
    existing.name = payload.name;
    existing.openTime = payload.openTime ?? existing.openTime;
    existing.closeTime = payload.closeTime ?? existing.closeTime;
    existing.status = payload.status ?? existing.status;
    existing.description = payload.description ?? existing.description;
  } else {
    lotteries.push({
      id: payload.code,
      name: payload.name,
      type: payload.kind || "international",
      group: payload.group || "อื่นๆ",
      status: payload.status || "open",
      openTime: payload.openTime || new Date().toISOString(),
      closeTime: payload.closeTime || new Date().toISOString(),
      description: payload.description || ""
    });
  }
  res.status(201).json(lotteries.find((l) => l.id === payload.code));
});

const MAX_ITEMS_PER_TICKET = 500;
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

function buildPurchaseItems(body) {
  const metaItems = Array.isArray(body?.meta?.items) ? body.meta.items : [];
  if (metaItems.length) {
    return metaItems.map((it) => ({
      number: String(it?.number ?? "").trim(),
      betType: it?.betType,
      amount: Number(it?.amount)
    }));
  }
  // รูปแบบเก่า: bets + amount รวม แบ่งเท่าๆ กัน ใช้ประเภทแรกของ meta.betTypes
  const bets = Array.isArray(body?.bets) ? body.bets : [];
  const perItem = bets.length ? Number(body?.amount) / bets.length : 0;
  return bets.map((number) => ({ number: String(number ?? "").trim(), betType: body?.meta?.betTypes?.[0], amount: perItem }));
}

function purchaseErrorResponse(res, err) {
  const known = {
    INSUFFICIENT_CREDIT: "เครดิตไม่เพียงพอ",
    LIMIT_EXCEEDED: err.message,
    USER_NOT_FOUND: "ไม่พบข้อมูลผู้ใช้"
  };
  if (known[err.code]) {
    return res.status(err.code === "USER_NOT_FOUND" ? 404 : 400).json({ message: known[err.code], code: err.code, details: err.details });
  }
  console.error("purchase failed:", err);
  return res.status(500).json({ message: "ไม่สามารถบันทึกโพยได้" });
}

app.post("/api/purchases", async (req, res) => {
  const { lotteryId, promotionCode } = req.body || {};
  if (req.session?.role === "admin") {
    return res.status(403).json({ message: "บัญชีผู้ดูแลระบบไม่อนุญาตให้แทงหวย" });
  }
  const lottery = findLottery(lotteryId);
  if (!lottery) {
    return res.status(404).json({ message: "ไม่พบหวยที่ต้องการ" });
  }
  if (lottery.status === "closed") {
    return res.status(400).json({ message: "หวยปิดรับแทงแล้ว" });
  }

  const now = new Date();
  const draw = await resolveCurrentDraw(lotteryId, now);
  if (!draw) {
    return res.status(400).json({ message: "ยังไม่มีงวดที่เปิดรับแทง" });
  }
  const { drawDate, closeAt } = draw;
  if (hasDatabase() && (await fetchResultForDraw(lotteryId, drawDate).catch(() => null))) {
    return res.status(400).json({ message: `งวด ${drawDate} ประกาศผลแล้ว ไม่สามารถแทงเพิ่มได้` });
  }

  const rawItems = buildPurchaseItems(req.body);
  if (!rawItems.length) {
    return res.status(400).json({ message: "กรอกข้อมูลโพยให้ครบถ้วน" });
  }
  if (rawItems.length > MAX_ITEMS_PER_TICKET) {
    return res.status(400).json({ message: `โพย 1 ใบแทงได้ไม่เกิน ${MAX_ITEMS_PER_TICKET} รายการ` });
  }

  let rates = [];
  let restrictions = [];
  try {
    rates = await loadPayoutRates(lotteryId);
    restrictions = hasDatabase() ? await listNumberRestrictions({ lotteryCode: lotteryId }) : [];
  } catch (err) {
    console.error("load rates for purchase failed:", err);
    return res.status(500).json({ message: "ไม่สามารถโหลดเรทจ่ายได้" });
  }
  const rateByType = new Map(rates.map((r) => [r.betType, Number(r.rate)]));
  const minBet = Number(lottery.minBet ?? appSettings.defaultMinBet ?? 1);
  const maxBet = Number(lottery.maxBet ?? appSettings.defaultMaxBet ?? Infinity);

  const errors = [];
  const items = [];
  for (const raw of rawItems) {
    const label = BET_TYPE_LABELS[raw.betType] ?? raw.betType;
    if (!isKnownBetType(raw.betType) || !rateByType.has(raw.betType)) {
      errors.push(`${lottery.name} ไม่เปิดรับประเภท ${label ?? "-"}`);
      continue;
    }
    if (!isValidBetNumber(raw.betType, raw.number)) {
      errors.push(`เลข "${raw.number}" ไม่ถูกต้องสำหรับ ${label}`);
      continue;
    }
    if (!Number.isFinite(raw.amount) || raw.amount < minBet || raw.amount > maxBet || roundMoney(raw.amount) !== raw.amount) {
      errors.push(`ยอดแทงเลข ${raw.number} (${label}) ต้องอยู่ระหว่าง ${minBet.toLocaleString()}-${maxBet.toLocaleString()} บาท`);
      continue;
    }
    const restriction = findRestriction(restrictions, { lotteryCode: lotteryId, betType: raw.betType, number: raw.number });
    if (restriction?.payoutRate === 0) {
      errors.push(`เลข ${raw.number} (${label}) ปิดรับแทง`);
      continue;
    }
    items.push({
      number: raw.number,
      betType: raw.betType,
      betTypeLabel: label,
      grossAmount: raw.amount,
      payoutRate: restriction?.payoutRate ?? rateByType.get(raw.betType),
      restriction
    });
  }
  if (errors.length) {
    return res.status(400).json({ message: errors[0], errors });
  }

  const grossAmount = roundMoney(items.reduce((sum, it) => sum + it.grossAmount, 0));
  if (req.body?.amount != null && Math.abs(Number(req.body.amount) - grossAmount) > 0.01) {
    return res.status(400).json({ message: "ยอดรวมไม่ตรงกับรายการในโพย กรุณาลองใหม่" });
  }

  let promoInfo = null;
  if (promotionCode) {
    if (hasDatabase()) {
      try {
        const promos = await listPromotions();
        promoInfo = promos.find((p) => p.code === promotionCode);
      } catch (err) {
        console.error("promo lookup failed:", err);
      }
    }
    if (!promoInfo) {
      promoInfo = fallbackPromotions.find((p) => p.code === promotionCode);
    }
    if (!promoInfo) {
      return res.status(400).json({ message: "ไม่พบโปรโมชันที่เลือก" });
    }
  }
  const discountPercent = Math.min(100, Math.max(0, Number(promoInfo?.discount_percent ?? 0)));
  // ยอดที่ตัดเครดิตจริงต่อรายการ (หลังส่วนลด) และเป็นฐานคำนวณเงินรางวัล
  items.forEach((it) => {
    it.amount = roundMoney(it.grossAmount * (1 - discountPercent / 100));
  });
  const netAmount = roundMoney(items.reduce((sum, it) => sum + it.amount, 0));

  // เลขอั้นจำกัดยอด: รวมยอดของเลขเดียวกันในโพยนี้
  const limitMap = new Map();
  for (const it of items) {
    if (it.restriction?.maxAmount == null) continue;
    const key = `${it.betType}:${it.number}`;
    const current = limitMap.get(key) ?? {
      betType: it.betType,
      number: it.number,
      maxAmount: Number(it.restriction.maxAmount),
      scope: it.restriction.scope,
      adding: 0
    };
    current.adding = roundMoney(current.adding + it.amount);
    limitMap.set(key, current);
  }
  const limits = Array.from(limitMap.values());
  const ticketLimitError = limits.find((limit) => limit.scope === "ticket" && limit.adding > limit.maxAmount + 1e-6);
  if (ticketLimitError) {
    return res.status(400).json({
      message: `เลข ${ticketLimitError.number} แทงได้ไม่เกิน ${ticketLimitError.maxAmount.toLocaleString()} บาทต่อโพย`
    });
  }

  const responseItems = items.map(({ restriction, ...it }) => ({
    ...it,
    potentialPayout: roundMoney(it.amount * Number(it.payoutRate ?? 0))
  }));
  const ticket = {
    member: req.session.username,
    lotteryId,
    betNumbers: items.map((it) => it.number),
    grossAmount,
    amount: netAmount,
    items: responseItems,
    promotionCode: promoInfo?.code ?? null,
    potentialPayout: roundMoney(responseItems.reduce((sum, it) => sum + it.potentialPayout, 0)),
    status: "pending",
    createdAt: now.toISOString(),
    drawDate,
    closeAt: closeAt.toISOString()
  };

  if (hasDatabase()) {
    try {
      const saved = await createTicketWithItems({
        userId: req.session.userId,
        lotteryCode: lotteryId,
        drawDate,
        amount: netAmount,
        promotionCode: promoInfo?.code ?? null,
        items,
        limits
      });
      ticket.id = saved.ticketId;
      ticket.items = responseItems.map((it, idx) => ({ ...it, id: saved.itemIds[idx] }));
      ticket.payoutRate = items[0].payoutRate ?? null;
      const creditSnapshot = {
        creditLimit: saved.creditLimit,
        creditUsed: saved.creditUsed,
        creditAvailable: saved.creditAvailable
      };
      return res.status(201).json({
        ...ticket,
        creditSnapshot,
        profile: { id: req.session.userId, username: req.session.username, role: req.session.role, ...creditSnapshot }
      });
    } catch (err) {
      return purchaseErrorResponse(res, err);
    }
  }

  // โหมดสาธิต (ไม่มีฐานข้อมูล)
  const fallbackUser = users.find((u) => u.username === req.session.username);
  if (!fallbackUser) {
    return res.status(400).json({ message: "ไม่พบข้อมูลผู้ใช้" });
  }
  const available = Number(fallbackUser.creditLimit ?? 0) - Number(fallbackUser.creditUsed ?? 0);
  if (netAmount > available + 1e-6) {
    return res.status(400).json({ message: "เครดิตไม่เพียงพอ" });
  }
  fallbackUser.creditLimit = Number(fallbackUser.creditLimit ?? 0) - netAmount;
  ticket.id = nanoid(8);
  purchaseHistory.unshift(ticket);
  const creditSnapshot = {
    creditLimit: fallbackUser.creditLimit,
    creditUsed: fallbackUser.creditUsed,
    creditAvailable: fallbackUser.creditLimit - fallbackUser.creditUsed
  };
  return res.status(201).json({
    ...ticket,
    creditSnapshot,
    profile: { id: fallbackUser.id, username: fallbackUser.username, role: fallbackUser.role, ...creditSnapshot }
  });
});

app.post("/api/tickets/:id/cancel", async (req, res) => {
  const ticketId = String(req.params.id || "").trim();
  if (!ticketId) return res.status(400).json({ message: "ticketId ไม่ถูกต้อง" });
  const isAdmin = req.session?.role === "admin";
  const assertCancelWindow = (lotteryCode, drawDate) => {
    const closeAt = resolveLotteryCloseTime(findLottery(lotteryCode), drawDate);
    if (!closeAt) return "ไม่พบเวลาปิดรับแทงของหวยนี้";
    if (Date.now() >= closeAt.getTime() - CANCEL_WINDOW_MINUTES * 60 * 1000) {
      return `เกินเวลายกเลิกโพย (ต้องก่อนปิดรับ ${CANCEL_WINDOW_MINUTES} นาที)`;
    }
    return null;
  };

  if (hasDatabase()) {
    if (!/^\d+$/.test(ticketId)) return res.status(400).json({ message: "ticketId ไม่ถูกต้อง" });
    try {
      const ticket = await fetchTicketById(ticketId);
      if (!ticket) return res.status(404).json({ message: "ไม่พบโพย" });
      if (!isAdmin && String(ticket.userId) !== String(req.session.userId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์ยกเลิกโพยนี้" });
      }
      const drawDate = ticket.drawDate || resolveDrawDateForLottery(ticket.lotteryCode, ticket.createdAt);
      const windowError = assertCancelWindow(ticket.lotteryCode, drawDate);
      if (windowError) return res.status(400).json({ message: windowError });
      const outcome = await cancelPendingTicket(ticket.id);
      return res.json({ ok: true, ticketId: outcome.ticketId, refund: outcome.refund });
    } catch (err) {
      if (err.code === "NOT_PENDING" || err.code === "NOT_FOUND") {
        return res.status(400).json({ message: err.message });
      }
      console.error("cancel ticket failed:", err.message || err);
      return res.status(500).json({ message: "ไม่สามารถยกเลิกโพยได้" });
    }
  }

  const ticket = purchaseHistory.find((t) => String(t.id) === ticketId);
  if (!ticket) return res.status(404).json({ message: "ไม่พบโพย" });
  if (!isAdmin && ticket.member !== req.session.username) {
    return res.status(403).json({ message: "ไม่มีสิทธิ์ยกเลิกโพยนี้" });
  }
  if (String(ticket.status || "").toLowerCase() !== "pending") {
    return res.status(400).json({ message: "โพยนี้ไม่สามารถยกเลิกได้" });
  }
  const windowError = assertCancelWindow(ticket.lotteryId, ticket.drawDate || resolveDrawDateForLottery(ticket.lotteryId, ticket.createdAt));
  if (windowError) return res.status(400).json({ message: windowError });
  const refundAmount = Math.max(0, Number(ticket.amount ?? 0));
  ticket.status = "cancelled";
  const demoUser = users.find((u) => u.username === ticket.member);
  if (demoUser) {
    demoUser.creditLimit = Number(demoUser.creditLimit ?? 0) + refundAmount;
  }
  return res.json({ ok: true, ticketId: ticket.id, refund: refundAmount });
});

app.get("/api/purchases/reports", (req, res) => {
  const { status } = req.query;
  const sessionUser = req.session?.username;
  const sessionRole = (req.session?.role || "").toLowerCase();
  const isSuperAdmin = sessionRole.includes("admin");
  if (!sessionUser) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  const resultsMap = defaultResults;
  let data = hydrateTicketsWithResults(purchaseHistory, resultsMap).filter((item) => (status ? item.status === status : true));
  if (!isSuperAdmin) {
    data = data.filter((item) => item.member === sessionUser);
  }
  res.json(data);
});

app.get("/api/admin/summary", async (req, res) => {
  try {
    const sessionRole = (req.session?.role || "").toLowerCase();
    const isSuperAdmin = sessionRole.includes("admin");
    let active = lotteries.filter((l) => l.status === "open").length;
    const todayKey = new Date().toISOString().slice(0, 10);
    let totalStake = purchaseHistory
      .filter((item) => item.createdAt?.slice(0, 10) === todayKey)
      .filter((item) => (isSuperAdmin ? true : item.member === req.session?.username))
      .reduce((sum, item) => sum + item.amount, 0);
    let creditStats = {
      creditUsed: users.reduce((sum, u) => sum + u.creditUsed, 0),
      creditLimit: users.reduce((sum, u) => sum + u.creditLimit, 0),
      totalMembers: users.length
    };
    let resultPayload = defaultResults;

    if (hasDatabase()) {
      if (isSuperAdmin) {
        const stats = await fetchCreditSummary();
        creditStats = {
          creditUsed: stats.creditUsed,
          creditLimit: stats.creditLimit,
          totalMembers: stats.totalMembers
        };
      } else {
        const { rows } = await pool.query("SELECT credit_limit, credit_used FROM users WHERE id = $1", [req.session.userId]);
        creditStats = {
          creditUsed: Number(rows[0]?.credit_used ?? 0),
          creditLimit: Number(rows[0]?.credit_limit ?? 0),
          totalMembers: 1
        };
      }
      try {
        active = await countOpenLotteries();
      } catch (err) {
        console.error("count lottery failed:", err.message);
      }
      try {
        totalStake = await sumTicketAmount({ todayOnly: true, userId: isSuperAdmin ? undefined : req.session?.userId });
      } catch (err) {
        console.error("sum ticket failed:", err.message);
      }
      try {
        resultPayload = await fetchLatestResults(["th-lottery", "lao-lottery"]);
      } catch (err) {
        console.error("fetch results failed:", err.message);
      }
    }

    res.json({
      activeLotteries: active,
      todayStake: totalStake,
      creditUsed: creditStats.creditUsed,
      creditLimit: creditStats.creditLimit,
      totalMembers: creditStats.totalMembers,
      announcements,
      results: resultPayload
    });
  } catch (err) {
    console.error("summary failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลสรุปได้" });
  }
});

app.get("/api/admin/members", async (req, res) => {
  if (!hasDatabase()) {
    return res.json(users);
  }
  try {
    const rows = await listUsers();
    res.json(rows);
  } catch (err) {
    console.error("members failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลสมาชิกได้" });
  }
});

app.get("/api/admin/credit-ledger", async (req, res) => {
  const sessionRole = (req.session?.role || "").toLowerCase();
  const isSuperAdmin = sessionRole.includes("admin");
  const userMap = new Map();
  const requestedFilter = (req.query?.username || "").toLowerCase();
  const selfFilter = (req.session?.username || "").toLowerCase();
  const enforceFilter = isSuperAdmin ? requestedFilter : selfFilter;
  if (!req.session?.username) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });

  // สถานะ/ยอดรางวัลมาจากผลตรวจที่บันทึกไว้เท่านั้น (ไม่เดาจากผลล่าสุด)
  const hydrateLedger = (items) =>
    items.map((item) => {
      const numbers = normalizeNumberList(item.numbers ?? item.betNumbers);
      const drawDate = item.drawDate || resolveDrawDateForLottery(item.lotteryId, item.createdAt);
      return {
        ...item,
        numbers,
        drawDate,
        credit: item.status === "won" ? Number(item.credit ?? 0) : 0,
        status: item.status || "pending"
      };
    });

  if (hasDatabase()) {
    try {
      const members = isSuperAdmin ? await listUsers().catch(() => []) : [];
      members.forEach((m) => userMap.set(String(m.username).toLowerCase(), m.username));
      members.forEach((m) => userMap.set(String(m.id), m.username));
      const rows = await fetchLedger(isSuperAdmin ? 300 : 200, { userId: isSuperAdmin ? undefined : req.session.userId });
      const ledger = hydrateLedger(rows).map((item) => ({
        ...item,
        member: userMap.get(String(item.member).toLowerCase()) || userMap.get(String(item.member)) || item.member
      }));
      const filtered = ledger.filter((item) => {
        const member = (item.member || "").toLowerCase();
        if (!isSuperAdmin) {
          return !selfFilter || member === selfFilter;
        }
        if (enforceFilter) {
          return member.includes(enforceFilter);
        }
        return true;
      });
      return res.json(filtered);
    } catch (err) {
      console.error("ledger failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงเดินบัญชีได้" });
    }
  }
  const ledger = hydrateLedger(purchaseHistory.map((item) => ({ ...item, numbers: normalizeNumberList(item.betNumbers) }))).map((item) => ({
    ...item,
    member: userMap.get(String(item.member).toLowerCase()) || userMap.get(String(item.member)) || item.member
  }));
  const filtered = ledger.filter((item) => {
    const member = (item.member || "").toLowerCase();
    if (!isSuperAdmin) {
      return !selfFilter || member === selfFilter;
    }
    if (enforceFilter) {
      return member.includes(enforceFilter);
    }
    return true;
  });
  res.json(filtered);
});

app.get("/api/admin/credit-between", async (req, res) => {
  const sessionUser = req.session?.username;
  const sessionRole = (req.session?.role || "").toLowerCase();
  const isSuperAdmin = sessionRole.includes("admin");
  if (!sessionUser) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  if (!hasDatabase()) {
    const fallback = users.map((u) => ({
      username: u.username,
      creditLimit: u.creditLimit,
      creditAvailable: u.creditLimit - u.creditUsed,
      children: u.children
    }));
    if (!isSuperAdmin) {
      const own = fallback.find((f) => f.username === sessionUser);
      return res.json(own ? [own] : []);
    }
    return res.json(fallback);
  }
  try {
    const rows = await listUsers();
    const mapped = rows.map((u) => ({
      username: u.username,
      creditLimit: u.creditLimit,
      creditAvailable: u.creditLimit - u.creditUsed,
      children: []
    }));
    if (!isSuperAdmin) {
      const own = mapped.find((m) => m.username === sessionUser);
      return res.json(own ? [own] : []);
    }
    res.json(mapped);
  } catch (err) {
    console.error("credit-between failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงสถานะเครดิตได้" });
  }
});

app.get("/api/admin/daily-summary", async (req, res) => {
  if (hasDatabase()) {
    try {
      const sessionRole = (req.session?.role || "").toLowerCase();
      const isSuperAdmin = sessionRole.includes("admin");
      const summary = await fetchDailyTicketSummary(isSuperAdmin ? null : req.session?.userId);
      return res.json(summary);
    } catch (err) {
      console.error("daily summary failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงข้อมูลสรุปรายวันได้" });
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const sessionUser = req.session?.username;
  const sessionRole = (req.session?.role || "").toLowerCase();
  const isSuperAdmin = sessionRole.includes("admin");
  const total = purchaseHistory.reduce(
    (acc, item) => {
      const dateOnly = item.createdAt.slice(0, 10);
      if (dateOnly !== today) return acc;
      if (!isSuperAdmin && item.member !== sessionUser) return acc;
      acc.tickets += 1;
      acc.amount += item.amount;
      return acc;
    },
    { tickets: 0, amount: 0 }
  );

  res.json({
    date: today,
    totalTickets: total.tickets,
    totalAmount: total.amount,
    estimateRevenue: total.amount * 0.2
  });
});

app.get("/api/admin/income-report", async (req, res) => {
  if (hasDatabase()) {
    try {
      const report = await fetchIncomeReportFromDb();
      return res.json(report);
    } catch (err) {
      console.error("income report failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงรายงานรายได้ได้" });
    }
  }
  const income = lotteries.map((lottery) => {
    const sessionUser = req.session?.username;
    const sessionRole = (req.session?.role || "").toLowerCase();
    const isSuperAdmin = sessionRole.includes("admin");
    const related = purchaseHistory.filter((purchase) => purchase.lotteryId === lottery.id && (isSuperAdmin ? true : purchase.member === sessionUser));
    const amount = related.reduce((sum, item) => sum + item.amount, 0);
    return {
      lottery: lottery.name,
      totalStake: amount,
      estimatedMargin: amount * 0.18
    };
  });
  res.json(income);
});

app.get("/api/admin/settings", (req, res) => {
  res.json(appSettings);
});

app.post("/api/admin/settings", async (req, res, next) => {
  try {
    const saved = { ...appSettings };
    for (const key of Object.keys(appSettings)) if (Object.hasOwn(req.body || {}, key)) saved[key] = req.body[key];
    await settingsStore.save('app', saved);
    Object.assign(appSettings, saved);
    res.json({ ...appSettings, savedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

app.post("/api/admin/users", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const {
    username,
    password,
    role = "agent",
    creditLimit = 0,
    fullName,
    bankName,
    bankAccount,
    bsb,
    phone
  } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "ต้องกรอก username และ password" });
  }
  try {
    if (!validPassword(password)) return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์" });
    const passwordHash = await hashPassword(password);
    const normalizedRole = role === "user" ? "agent" : role;
    const user = await createUserAccount({ username, passwordHash, role: normalizedRole, creditLimit: Number(creditLimit) || 0 });
    // บันทึกโปรไฟล์เพิ่มเติม (ชื่อบัญชี/ธนาคาร/เบอร์/bsb)
    if (fullName || bankName || bankAccount || bsb || phone) {
      try {
        await upsertUserProfile(user.id, {
          fullName: fullName ?? null,
          bankName: bankName ?? null,
          bankAccount: bankAccount ?? null,
          bsb: bsb ?? null,
          phone: phone ?? null
        });
      } catch (e) {
        console.error("save user profile failed:", e.message || e);
      }
    }
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถสร้างผู้ใช้ได้", error: err.message });
  }
});

app.patch("/api/admin/users/:id/credit", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "ระบุรหัสผู้ใช้ไม่ถูกต้อง" });
  }
  try {
    const topupAmount =
      typeof req.body.topupAmount === "number" ? req.body.topupAmount : undefined;
    await updateUserCredit(userId, {
      creditLimit: typeof req.body.creditLimit === "number" ? req.body.creditLimit : undefined,
      creditUsed: typeof req.body.creditUsed === "number" ? req.body.creditUsed : undefined,
      topupAmount
    });
    if (typeof topupAmount === "number" && topupAmount > 0) {
      const targetUsername = await resolveUsernameById(userId);
      await appendAuditLogEntry({
        action: "credit_topup",
        actorId: req.session?.userId ?? null,
        actorUsername: req.session?.username ?? null,
        targetUserId: userId,
        targetUsername: targetUsername ?? null,
        amount: topupAmount,
        status: "approved"
      });
    }
    res.json({ message: "อัปเดตเครดิตสำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถอัปเดตเครดิตได้", error: err.message });
  }
});

app.post("/api/admin/users/:id/deposit", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const userId = Number(req.params.id);
  const amount = Number(req.body?.amount ?? 0);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !validAmount(amount)) {
    return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
  }
  try {
    await pool.query("UPDATE users SET credit_limit = credit_limit + $1 WHERE id = $2", [amount, userId]);
    const { rows } = await pool.query("SELECT credit_limit, credit_used FROM users WHERE id = $1", [userId]);
    const creditLimit = Number(rows?.[0]?.credit_limit ?? 0);
    const creditUsed = Number(rows?.[0]?.credit_used ?? 0);
    const targetUsername = await resolveUsernameById(userId);
    await appendAuditLogEntry({
      action: "admin_deposit",
      actorId: req.session?.userId ?? null,
      actorUsername: req.session?.username ?? null,
      targetUserId: userId,
      targetUsername: targetUsername ?? null,
      amount,
      status: "approved"
    });
    res.json({
      message: "ฝากเครดิตสำเร็จ",
      creditUsed,
      creditLimit,
      creditAvailable: creditLimit - creditUsed
    });
  } catch (err) {
    console.error("deposit failed:", err);
    res.status(400).json({ message: err.message || "ไม่สามารถฝากเครดิตได้" });
  }
});

app.post("/api/admin/users/:id/withdraw", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const userId = Number(req.params.id);
  const amount = Number(req.body?.amount ?? 0);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !validAmount(amount)) {
    return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
  }
  try {
    const { rows } = await pool.query(`UPDATE users SET credit_limit=credit_limit-$2
      WHERE id=$1 AND credit_limit-credit_used >= $2 RETURNING credit_limit, credit_used`, [userId, amount]);
    if (!rows.length) return res.status(400).json({ message: 'เครดิตไม่เพียงพอหรือไม่พบผู้ใช้' });
    const result = { creditLimit: Number(rows[0].credit_limit), creditUsed: Number(rows[0].credit_used), creditAvailable: Number(rows[0].credit_limit) - Number(rows[0].credit_used) };
    const targetUsername = await resolveUsernameById(userId);
    await appendAuditLogEntry({
      action: "admin_withdraw",
      actorId: req.session?.userId ?? null,
      actorUsername: req.session?.username ?? null,
      targetUserId: userId,
      targetUsername: targetUsername ?? null,
      amount,
      status: "approved"
    });
    res.json({
      message: "ถอนเครดิตสำเร็จ",
      creditUsed: result.creditUsed,
      creditLimit: result.creditLimit,
      creditAvailable: result.creditAvailable
    });
  } catch (err) {
    console.error("withdraw failed:", err);
    const status = err.message === "ยอดเครดิตไม่เพียงพอ" ? 400 : 500;
    res.status(status).json({ message: err.message || "ไม่สามารถถอนเครดิตได้" });
  }
});

app.get("/api/admin/payout-rates/:lotteryCode", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  try {
    const rows = await fetchPayoutRates(req.params.lotteryCode);
    res.json(withRtp(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลเรตจ่ายได้" });
  }
});

app.get("/api/admin/transactions", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  if (hasDatabase()) {
    try {
      const rows = await listTransactions({ limit: 200 });
      return res.json(rows);
    } catch (err) {
      if (err.code !== "TRANSACTIONS_UNAVAILABLE") {
        console.error("admin transactions failed:", err);
      }
      return res.json(fallbackTransactions.slice(-200).reverse());
    }
  }
  res.json(fallbackTransactions.slice(-200).reverse());
});

app.get("/api/admin/credit-history", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const allowedActions = new Set([
    "credit_topup",
    "admin_deposit",
    "admin_withdraw",
    "transaction_approved",
    "transaction_rejected"
  ]);
  if (hasDatabase()) {
    try {
      const rows = await listAuditLogs({ limit: 200 });
      const filtered = rows.filter((row) => allowedActions.has(row.action)).map(normalizeAuditEntry);
      return res.json(filtered);
    } catch (err) {
      if (err.code !== "AUDIT_LOG_UNAVAILABLE") {
        console.error("admin credit history failed:", err);
      }
    }
  }
  const fallback = fallbackAuditLogs
    .filter((row) => allowedActions.has(row.action))
    .slice(0, 200)
    .map(normalizeAuditEntry);
  res.json(fallback);
});

// Admin: approve a transaction (deposit/withdraw)
app.post("/api/admin/transactions/:id/approve", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ระบุ id ให้ถูกต้อง" });
  if (hasDatabase()) {
    try {
      const txn = await decideTestTransaction(pool, id, "approved");
      const amountNum = Number(txn.amount);
      const txnType = txn.txnType;
      const isWithdraw = txnType === 'withdraw';
      const isDeposit = txnType === 'deposit';
      // notify user
      const type = isWithdraw ? "withdraw" : isDeposit ? "deposit" : "transaction";
      const title = isWithdraw ? "ถอนเงินอนุมัติ" : isDeposit ? "ฝากเงินอนุมัติ" : "อัปเดตสถานะธุรกรรม";
      const message =
        isWithdraw
          ? `คำขอถอน ${txn.amount}  ได้รับการอนุมัติ`
          : isDeposit
            ? `เงินฝาก ${txn.amount}  ได้รับการอนุมัติ`
            : `ธุรกรรม ${txn.amount} ได้รับการอัปเดตเป็น Approved`;
      try {
        await createNotification({
          userId: txn.userId,
          type,
          title,
          message,
          meta: { transactionId: id, amount: txn.amount }
        });
      } catch (e) {
        console.error("notify failed", e);
      }
      const targetUsername = await resolveUsernameById(txn.userId);
      await appendAuditLogEntry({
        action: "transaction_approved",
        actorId: req.session?.userId ?? null,
        actorUsername: req.session?.username ?? null,
        targetUserId: txn.userId,
        targetUsername: targetUsername ?? null,
        amount: amountNum,
        txnType,
        status: "approved",
        transactionId: id,
        note: txn.note ?? null
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error("approve txn failed:", err);
      return res.status(err.status || 500).json({ message: err.status ? err.message : "ไม่สามารถอนุมัติธุรกรรมได้" });
    }
  }
  // demo fallback
  const idx = fallbackTransactions.findIndex((t) => String(t.id) === String(id));
  if (idx === -1) return res.status(404).json({ message: "ไม่พบธุรกรรม" });
  const txn = fallbackTransactions[idx];
  if (txn.status !== "pending") return res.status(409).json({ message: "ธุรกรรมนี้ดำเนินการแล้ว" });
  txn.status = "approved";
  // apply credit to demo user
  const demoUser = users.find((u) => u.username === txn.username);
  if (demoUser) {
    const txnType = String(txn.txn_type || txn.txnType || "").toLowerCase();
    const isWithdraw = txnType === "withdraw";
    const isDeposit = txnType === "deposit";
    // ถอน: วงเงินถูกล็อกไว้ตอนสร้างคำขอแล้ว จึงไม่ต้องขยับอีก
    if (isDeposit) {
      demoUser.creditLimit = Number(demoUser.creditLimit ?? 0) + Number(txn.amount);
    } else if (!isWithdraw) {
      console.warn(`Unknown transaction type "${txnType}" for demo transaction id=${id}, skipping credit adjustment`);
    }
    const list = fallbackNotifications.get(demoUser.username) || [];
    const type = isWithdraw ? "withdraw" : isDeposit ? "deposit" : "transaction";
    const title = isWithdraw ? "ถอนเงินอนุมัติ" : isDeposit ? "ฝากเงินอนุมัติ" : "อัปเดตสถานะธุรกรรม";
    const message =
      isWithdraw
        ? `คำขอถอน ${txn.amount}  ได้รับการอนุมัติ`
        : isDeposit
          ? `เงินฝาก ${txn.amount}  ได้รับการอนุมัติ`
          : `ธุรกรรม ${txn.amount} ได้รับการอัปเดตเป็น Approved`;
    list.unshift({
      id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      title,
      message,
      meta: { transactionId: txn.id, amount: txn.amount },
      read: false,
      createdAt: new Date().toISOString()
    });
    fallbackNotifications.set(demoUser.username, list);
  }
  await appendAuditLogEntry({
    action: "transaction_approved",
    actorId: req.session?.userId ?? null,
    actorUsername: req.session?.username ?? null,
    targetUserId: demoUser?.id ?? null,
    targetUsername: txn.username ?? demoUser?.username ?? null,
    amount: Number(txn.amount),
    txnType: String(txn.txn_type || txn.txnType || "").toLowerCase(),
    status: "approved",
    transactionId: id,
    note: txn.note ?? null
  });
  return res.json({ ok: true });
});

// Admin: reject a transaction
app.post("/api/admin/transactions/:id/reject", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ระบุ id ให้ถูกต้อง" });
  const reason = req.body?.reason ?? null;
  if (hasDatabase()) {
    try {
      const txn = await decideTestTransaction(pool, id, "rejected");
      const type = txn.txnType === 'withdraw' ? 'withdraw' : 'deposit';
      const title = txn.txnType === 'withdraw' ? 'ถอนเงินไม่อนุมัติ' : 'ฝากเงินไม่อนุมัติ';
      const message = txn.txnType === 'withdraw'
        ? `คำขอถอน ${txn.amount}  ถูกปฏิเสธ${reason ? (': ' + reason) : ''}`
        : `คำขอฝาก ${txn.amount}  ถูกปฏิเสธ${reason ? (': ' + reason) : ''}`;
      try { await createNotification({ userId: txn.userId, type, title, message, meta: { transactionId: id, amount: txn.amount } }); } catch (e) { console.error('notify failed', e); }
      const targetUsername = await resolveUsernameById(txn.userId);
      await appendAuditLogEntry({
        action: "transaction_rejected",
        actorId: req.session?.userId ?? null,
        actorUsername: req.session?.username ?? null,
        targetUserId: txn.userId,
        targetUsername: targetUsername ?? null,
        amount: Number(txn.amount),
        txnType: String(txn.txnType || txn.txn_type || "").toLowerCase(),
        status: "rejected",
        transactionId: id,
        note: reason ?? txn.note ?? null
      });
      return res.json({ ok: true });
    } catch (err) {
      console.error('reject txn failed:', err);
      return res.status(err.status || 500).json({ message: err.status ? err.message : 'ไม่สามารถปฏิเสธธุรกรรมได้' });
    }
  }
  // demo fallback
  const idx = fallbackTransactions.findIndex((t) => String(t.id) === String(id));
  if (idx === -1) return res.status(404).json({ message: 'ไม่พบธุรกรรม' });
  const txn = fallbackTransactions[idx];
  if (txn.status !== 'pending') return res.status(409).json({ message: 'ธุรกรรมนี้ดำเนินการแล้ว' });
  txn.status = 'rejected';
  const demoUser = users.find((u) => u.username === txn.username);
  if (demoUser) {
    if (String(txn.txn_type || "").toLowerCase() === "withdraw") {
      demoUser.creditLimit = Number(demoUser.creditLimit ?? 0) + Number(txn.amount);
    }
    const list = fallbackNotifications.get(demoUser.username) || [];
    const type = txn.txn_type === 'withdraw' ? 'withdraw' : 'deposit';
    const title = txn.txn_type === 'withdraw' ? 'ถอนเงินไม่อนุมัติ' : 'ฝากเงินไม่อนุมัติ';
    const message = txn.txn_type === 'withdraw'
      ? `คำขอถอน ${txn.amount}  ถูกปฏิเสธ${reason ? (': ' + reason) : ''}`
      : `คำขอฝาก ${txn.amount}  ถูกปฏิเสธ${reason ? (': ' + reason) : ''}`;
    list.unshift({ id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`, type, title, message, meta: { transactionId: txn.id, amount: txn.amount }, read: false, createdAt: new Date().toISOString() });
    fallbackNotifications.set(demoUser.username, list);
  }
  await appendAuditLogEntry({
    action: "transaction_rejected",
    actorId: req.session?.userId ?? null,
    actorUsername: req.session?.username ?? null,
    targetUserId: demoUser?.id ?? null,
    targetUsername: txn.username ?? demoUser?.username ?? null,
    amount: Number(txn.amount),
    txnType: String(txn.txn_type || txn.txnType || "").toLowerCase(),
    status: "rejected",
    transactionId: id,
    note: reason ?? txn.note ?? null
  });
  return res.json({ ok: true });
});

app.put("/api/admin/payout-rates/:lotteryCode", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  const rateErrors = validatePayoutRates(req.body);
  if (rateErrors.length && !(req.query.force === "true" && rateErrors.every((e) => e.includes("เกิน 100%")))) {
    return res.status(400).json({ message: rateErrors[0], errors: rateErrors });
  }
  try {
    await replacePayoutRates(
      req.params.lotteryCode,
      req.body.map((item) => ({ ...item, rate: Number(item.rate) }))
    );
    res.json({ message: "บันทึกเรตจ่ายสำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถบันทึกเรตจ่ายได้" });
  }
});

app.get("/api/admin/purchase-logs", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const logs = await fetchPurchaseLogs(limit);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูล log ได้" });
  }
});

app.get("/api/admin/round-number-summary", async (req, res) => {
  if (req.session?.role !== "admin") return res.status(403).json({ message: "ต้องเป็นผู้ดูแลระบบ" });
  const lotteryCode = String(req.query?.lotteryCode || "").trim();
  const drawDate = String(req.query?.drawDate || "").trim();
  const startDate = String(req.query?.startDate || "").trim();
  const endDate = String(req.query?.endDate || "").trim();
  const useRange = Boolean(startDate || endDate);
  if (!lotteryCode) {
    return res.status(400).json({ message: "ระบุ lotteryCode" });
  }
  if (useRange) {
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "ระบุ startDate และ endDate (YYYY-MM-DD)" });
    }
    if (startDate > endDate) {
      return res.status(400).json({ message: "startDate ต้องไม่เกิน endDate" });
    }
  } else if (!drawDate) {
    return res.status(400).json({ message: "ระบุ drawDate (YYYY-MM-DD)" });
  }

  const buildTotals = (items) => {
    const totals = items.reduce(
      (acc, item) => {
        acc.totalAmount += Number(item.totalAmount ?? 0);
        acc.totalLines += Number(item.ticketCount ?? 0);
        return acc;
      },
      { totalAmount: 0, totalLines: 0, totalNumbers: items.length }
    );
    totals.totalNumbers = items.length;
    return totals;
  };

  if (hasDatabase()) {
    try {
      const items = useRange
        ? await fetchNumberSummaryForRange(lotteryCode, startDate, endDate)
        : await fetchNumberSummaryForDraw(lotteryCode, drawDate);
      const totals = buildTotals(items);
      if (useRange) {
        return res.json({ lotteryCode, startDate, endDate, totals, items });
      }
      return res.json({ lotteryCode, drawDate, totals, items });
    } catch (err) {
      console.error("round number summary failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงสรุปเลขของงวดได้" });
    }
  }

  const effectiveStart = useRange ? startDate : drawDate;
  const effectiveEnd = useRange ? endDate : drawDate;
  const itemsMap = new Map();
  const addItem = (item, username) => {
    const number = String(item?.number ?? "").trim();
    if (!number) return;
    const betType = String(item?.betType || item?.bet_type || "standard");
    const amount = Number(item?.amount ?? 0);
    const key = `${betType}::${number}`;
    const existing = itemsMap.get(key) || {
      number,
      betType,
      totalAmount: 0,
      ticketCount: 0,
      userSet: new Set()
    };
    existing.totalAmount += amount;
    existing.ticketCount += 1;
    if (username) existing.userSet.add(username);
    itemsMap.set(key, existing);
  };

  (purchaseHistory || []).forEach((ticket) => {
    if (ticket.lotteryId !== lotteryCode) return;
    const ticketDraw = ticket.drawDate || resolveDrawDateForLottery(ticket.lotteryId, ticket.createdAt);
    if (!ticketDraw) return;
    if (effectiveStart && ticketDraw < effectiveStart) return;
    if (effectiveEnd && ticketDraw > effectiveEnd) return;
    if (String(ticket.status || "").toLowerCase() === "cancelled") return;
    const username = ticket.member || "";
    if (Array.isArray(ticket.items) && ticket.items.length) {
      ticket.items.forEach((item) => addItem(item, username));
      return;
    }
    const numbers = normalizeNumberList(ticket.betNumbers);
    const count = numbers.length || 1;
    const amountPer = count ? Number(ticket.amount ?? 0) / count : 0;
    numbers.forEach((num) => {
      addItem({ number: num, amount: amountPer, betType: ticket.betType || "standard" }, username);
    });
  });

  const items = Array.from(itemsMap.values())
    .map((entry) => ({
      number: entry.number,
      betType: entry.betType,
      totalAmount: Number(entry.totalAmount ?? 0),
      ticketCount: Number(entry.ticketCount ?? 0),
      userCount: entry.userSet.size
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || String(a.number).localeCompare(String(b.number)));

  const totals = buildTotals(items);
  if (useRange) {
    return res.json({ lotteryCode, startDate, endDate, totals, items });
  }
  return res.json({ lotteryCode, drawDate, totals, items });
});

app.get("/api/admin/number-restrictions", async (req, res) => {
  if (!hasDatabase()) {
    return res.json([]);
  }
  try {
    const rows = await listNumberRestrictions();
    res.json(rows);
  } catch (err) {
    console.error("restrictions failed:", err);
    res.json([]);
  }
});

app.post("/api/admin/number-restrictions", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const { lotteryCode, betType, number, payoutRate, note, maxAmount, discountPercent, scope } = req.body || {};
  if (discountPercent != null && discountPercent !== 0) return res.status(400).json({ message: "ช่องลดเปอร์เซ็นต์ยังไม่เปิดใช้ กรุณากำหนดเรทจ่ายโดยตรง" });
  if ((payoutRate != null && (!Number.isFinite(payoutRate) || payoutRate < 0)) || (maxAmount != null && (!Number.isFinite(maxAmount) || maxAmount < 0))) return res.status(400).json({ message: "เรทหรือวงเงินไม่ถูกต้อง" });
  if (!lotteryCode || !betType || !number) {
    return res.status(400).json({ message: "กรอกข้อมูลให้ครบถ้วน" });
  }
  try {
    const created = await createNumberRestriction({
      lotteryCode,
      betType,
      number,
      payoutRate: typeof payoutRate === "number" ? payoutRate : null,
      maxAmount: typeof maxAmount === "number" ? maxAmount : null,
      discountPercent: typeof discountPercent === "number" ? discountPercent : null,
      scope: scope || null,
      note
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("create restriction failed:", err);
    res.status(500).json({ message: "ไม่สามารถบันทึกเลขอั้นได้" });
  }
});

app.delete("/api/admin/number-restrictions/:id", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
  }
  try {
    await deleteNumberRestriction(id);
    res.json({ message: "ลบเลขอั้นเรียบร้อย" });
  } catch (err) {
    console.error("delete restriction failed:", err);
    res.status(500).json({ message: "ไม่สามารถลบเลขอั้นได้" });
  }
});

app.get("/api/lottery-results/latest", async (req, res) => {
  if (!hasDatabase()) {
    return res.json(defaultResults);
  }
  try {
    res.json(await fetchLatestResults());
  } catch (err) {
    console.error("latest results failed:", err);
    res.status(500).json({ message: "ไม่สามารถดึงผลรางวัลได้" });
  }
});

const digitField = (value, length) => value == null || value === "" || new RegExp(`^\\d{${length}}$`).test(String(value));
const digitList = (value, length) => value == null || (Array.isArray(value) && value.length <= 2 && value.every((v) => digitField(v, length)));

// ตรวจรูปแบบผลรางวัลก่อนบันทึก
function validateResultPayload(payload) {
  const errors = [];
  if (!findLottery(payload.lotteryCode)) errors.push("ไม่พบหวยที่ระบุ");
  if (!isIsoDate(payload.drawDate)) errors.push("drawDate ต้องเป็นรูปแบบ YYYY-MM-DD");
  const family = String(payload.lotteryCode || "").startsWith("lao") ? "lao" : String(payload.lotteryCode || "").startsWith("viet") ? "viet" : "thai";
  const firstLength = family === "lao" ? 4 : family === "viet" ? null : 6;
  if (firstLength && !digitField(payload.firstPrize, firstLength)) errors.push(`รางวัลที่ 1 ต้องเป็นตัวเลข ${firstLength} หลัก`);
  if (!digitField(payload.threeDigits, 3)) errors.push("เลข 3 ตัว ต้องเป็นตัวเลข 3 หลัก");
  if (!digitField(payload.twoDigits, 2)) errors.push("เลข 2 ตัว ต้องเป็นตัวเลข 2 หลัก");
  if (!digitList(payload.frontThree, 3)) errors.push("3 ตัวหน้า ต้องเป็นรายการเลข 3 หลัก ไม่เกิน 2 ชุด");
  if (!digitList(payload.backThree, 3)) errors.push("3 ตัวล่าง ต้องเป็นรายการเลข 3 หลัก ไม่เกิน 2 ชุด");
  if (!digitList(payload.nearFirst, 6)) errors.push("ข้างเคียงรางวัลที่ 1 ต้องเป็นเลข 6 หลัก");
  const winning = resolveWinningNumbers(payload.lotteryCode, payload);
  if (!errors.length && !winning?.top3) errors.push("ต้องมีเลข 3 ตัวบน (รางวัลที่ 1 หรือเลข 3 ตัว)");
  return errors;
}

app.post("/api/admin/lottery-results", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const payload = req.body || {};
  const errors = validateResultPayload(payload);
  if (errors.length) {
    return res.status(400).json({ message: errors[0], errors });
  }
  try {
    const existing = await fetchResultForDraw(payload.lotteryCode, payload.drawDate);
    if (existing && req.query.force !== "true") {
      const settled = await countSettledTicketsForDraw(payload.lotteryCode, payload.drawDate);
      if (settled > 0) {
        return res.status(409).json({
          message: `งวดนี้ตรวจโพยไปแล้ว ${settled} ใบ การแก้ผลจะไม่ย้อนรายการที่จ่ายแล้ว (ส่ง ?force=true หากยืนยัน)`
        });
      }
    }
    const saved = await upsertLotteryResult(payload);
    let evaluation = null;
    try {
      evaluation = await evaluateTicketsForDraw(saved.lotteryCode, saved.drawDate);
    } catch (err) {
      console.error("auto-evaluate failed:", err.message || err);
      evaluation = { error: err.message || "evaluate failed" };
    }
    res.status(201).json({ ...saved, evaluation });
  } catch (err) {
    console.error("save result failed:", err);
    res.status(500).json({ message: "ไม่สามารถบันทึกผลรางวัลได้", error: err.message });
  }
});

// Admin: ดึงผลหวยรัฐบาลไทยจาก GLO แล้วตรวจโพยอัตโนมัติ
// body: { dates?: ["YYYY-MM-DD"], includeLatest?: boolean }
app.post("/api/admin/sync/thai-lottery", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  }
  const dates = Array.isArray(req.body?.dates) ? req.body.dates.filter(isIsoDate).slice(0, 24) : [];
  const includeLatest = req.body?.includeLatest !== false;
  try {
    const result = await syncThaiLottoFromApi({ dates, includeLatest });
    if (!result.saved && result.skipped.some((s) => /GLO/.test(s.reason || ""))) {
      return res.status(502).json({ message: "เชื่อมต่อแหล่งผลรางวัล (GLO) ไม่สำเร็จ", ...result });
    }
    res.json(result);
  } catch (err) {
    console.error("sync thai lottery failed:", err);
    res.status(500).json({ message: "ซิงก์ผลหวยไทยไม่สำเร็จ", error: err.message });
  }
});

// Admin: ตรวจโพยของงวดที่ระบุ
app.post("/api/admin/lottery-results/:lotteryCode/:drawDate/evaluate", async (req, res) => {
  const { lotteryCode, drawDate } = req.params;
  if (!lotteryCode || !isIsoDate(drawDate)) return res.status(400).json({ message: "ระบุ lotteryCode และ drawDate (YYYY-MM-DD)" });

  if (hasDatabase()) {
    try {
      const result = await evaluateTicketsForDraw(lotteryCode, drawDate);
      return res.json(result);
    } catch (err) {
      console.error("evaluate failed:", err.message || err);
      return res.status(500).json({ message: "ไม่สามารถประมวลผลโพยได้", error: err.message });
    }
  }

  // โหมดสาธิต: ตรวจจาก purchaseHistory ในหน่วยความจำ ด้วยกติกาเดียวกับโหมดฐานข้อมูล
  const result = defaultResults?.[lotteryCode];
  if (!result || result.drawDate !== drawDate) {
    return res.status(404).json({ message: "ไม่มีผลรางวัลสำหรับงวดที่ระบุ" });
  }
  const winning = resolveWinningNumbers(lotteryCode, result);
  const rateByType = new Map((payoutSeeds[lotteryCode] || []).map((r) => [r.betType, Number(r.rate)]));
  let evaluated = 0;
  let winners = 0;
  let totalPayout = 0;
  const details = [];
  for (const ticket of purchaseHistory) {
    if (ticket.lotteryId !== lotteryCode || ticket.status !== "pending" || ticket.drawDate !== drawDate) continue;
    evaluated += 1;
    let payout = 0;
    for (const item of ticket.items || []) {
      if (!canSettleBetType(item.betType, winning)) continue;
      const won = isWinningBet(item.betType, item.number, winning);
      item.status = won ? "won" : "lost";
      if (won) {
        const rate = item.payoutRate ?? rateByType.get(item.betType) ?? 0;
        item.payoutAmount = roundMoney(Number(item.amount) * rate);
        payout += item.payoutAmount;
      }
    }
    const pending = (ticket.items || []).some((it) => !it.status || it.status === "pending");
    ticket.status = pending ? "pending" : payout > 0 ? "won" : "lost";
    ticket.credit = payout;
    if (payout > 0) {
      winners += 1;
      totalPayout += payout;
      const demoUser = users.find((u) => u.username === ticket.member);
      if (demoUser) demoUser.creditLimit = Number(demoUser.creditLimit ?? 0) + payout;
    }
    details.push({ ticketId: ticket.id, username: ticket.member, status: ticket.status, amount: ticket.amount, payoutAmount: payout });
  }
  return res.json({ lotteryCode, drawDate, evaluated, winners, totalPayout, details });
});

// Admin: ตรวจโพยที่ค้างทุกหวยจากผลล่าสุด
app.post("/api/admin/evaluate/latest", async (req, res) => {
  if (!hasDatabase()) return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  const filterCode = req.body?.lotteryCode || req.query?.lotteryCode || null;
  try {
    const latest = await fetchLatestResults(filterCode ? [filterCode] : undefined);
    const entries = Object.entries(latest || {}).filter(([, info]) => info?.drawDate);
    if (!entries.length) {
      return res.status(404).json({ message: "ไม่พบผลรางวัลล่าสุดสำหรับประมวลผล" });
    }
    const results = [];
    const errors = [];
    for (const [code, info] of entries) {
      try {
        results.push(await evaluateTicketsForDraw(code, info.drawDate));
      } catch (err) {
        errors.push({ lotteryCode: code, drawDate: info.drawDate, error: err.message || "error" });
      }
    }
    return res.json({ success: true, results, errors });
  } catch (err) {
    console.error("auto-evaluate-latest failed:", err.message || err);
    return res.status(500).json({ message: "ไม่สามารถตรวจสอบโพยอัตโนมัติได้", error: err.message });
  }
});

function selectedItemIds(body) {
  const fromItems = Array.isArray(body?.items) ? body.items.map((it) => String(it?.id ?? "")) : [];
  const fromIds = Array.isArray(body?.itemIds) ? body.itemIds.map(String) : [];
  return new Set([...fromItems, ...fromIds].filter(Boolean));
}

// Admin: ยืนยันให้ถูกรางวัล (แก้ไขด้วยมือ)
// - ไม่ระบุรายการ: ใช้ได้กับโพยที่ยังรอผล จ่ายทุกรายการที่ยังรอผล
// - ระบุ items/itemIds: จ่ายเฉพาะรายการที่เลือกและยังไม่เคยจ่าย (ไม่จ่ายซ้ำ)
app.post("/api/admin/tickets/:id/confirm-win", async (req, res) => {
  if (!hasDatabase()) return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  const ticketId = String(req.params.id || "");
  if (!/^\d+$/.test(ticketId)) return res.status(400).json({ message: "ticketId ไม่ถูกต้อง" });
  const selected = selectedItemIds(req.body);
  const overrideById = new Map(
    (Array.isArray(req.body?.items) ? req.body.items : [])
      .filter((it) => it?.payoutRate != null && Number.isFinite(Number(it.payoutRate)))
      .map((it) => [String(it.id), Number(it.payoutRate)])
  );
  const ticketRate = req.body?.payoutRate != null && Number.isFinite(Number(req.body.payoutRate)) ? Number(req.body.payoutRate) : null;
  try {
    const ticket = await fetchTicketById(ticketId);
    if (!ticket) return res.status(404).json({ message: "ไม่พบโพย" });
    if (!selected.size && ticket.status !== "pending") {
      return res.status(400).json({ message: "โพยนี้ตรวจผลแล้ว ให้เลือกรายการที่ต้องการแก้ไข" });
    }
    const rates = await fetchPayoutRates(ticket.lotteryCode).catch(() => []);
    const rateByType = new Map(rates.map((r) => [r.betType, Number(r.rate)]));
    const outcome = await settleTicketItems(ticketId, {
      allowSettled: true,
      decide: (item) => {
        if (item.paid) return null;
        if (selected.size ? !selected.has(item.id) : item.status !== "pending") return null;
        const rate = overrideById.get(item.id) ?? ticketRate ?? item.payoutRate ?? rateByType.get(item.betType);
        if (rate == null) return null;
        return { status: "won", rate };
      }
    });
    if (!outcome) return res.status(400).json({ message: "โพยนี้ไม่สามารถแก้ไขได้" });
    if (!outcome.payout) {
      return res.status(400).json({ message: "ไม่มีรายการที่ยังไม่จ่าย หรือไม่พบเรทจ่ายของรายการที่เลือก" });
    }
    await appendAuditLogEntry({
      action: "ticket_confirm_win",
      actorId: req.session.userId,
      actorUsername: req.session.username,
      targetUserId: outcome.userId,
      targetUsername: outcome.username,
      amount: outcome.payout,
      note: `ticket #${ticketId}`
    });
    createNotification({
      userId: outcome.userId,
      type: "winner",
      title: "ถูกรางวัล (ยืนยันโดยแอดมิน)",
      message: `โพย #${ticketId} จ่าย ${outcome.payout.toLocaleString()} บาท`,
      meta: { ticketId, payoutAmount: outcome.payout }
    }).catch((err) => console.error("notify winner failed:", err.message || err));
    return res.json({ ticketId, payoutAmount: outcome.payout, status: outcome.status, items: outcome.items });
  } catch (err) {
    console.error("confirm-win failed:", err.message || err);
    return res.status(500).json({ message: "ไม่สามารถตั้งค่าโพยเป็นถูกรางวัลได้", error: err.message });
  }
});

// Admin: ยืนยันไม่ถูกรางวัล (ไม่ย้อนรายการที่จ่ายเงินแล้ว)
app.post("/api/admin/tickets/:id/confirm-lose", async (req, res) => {
  if (!hasDatabase()) return res.status(503).json({ message: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน" });
  const ticketId = String(req.params.id || "");
  if (!/^\d+$/.test(ticketId)) return res.status(400).json({ message: "ticketId ไม่ถูกต้อง" });
  const selected = selectedItemIds(req.body);
  try {
    const outcome = await settleTicketItems(ticketId, {
      allowSettled: true,
      decide: (item) => {
        if (item.paid) return null;
        if (selected.size ? !selected.has(item.id) : item.status !== "pending") return null;
        return { status: "lost" };
      }
    });
    if (!outcome) return res.status(404).json({ message: "ไม่พบโพย หรือโพยถูกยกเลิกแล้ว" });
    if (outcome.status === "lost") {
      createNotification({
        userId: outcome.userId,
        type: "loser",
        title: "โพยไม่ถูกรางวัล",
        message: `โพย #${ticketId} ไม่ถูกรางวัล`,
        meta: { ticketId }
      }).catch((err) => console.error("notify loser failed:", err.message || err));
    }
    return res.json({ ticketId, status: outcome.status, items: outcome.items });
  } catch (err) {
    console.error("confirm-lose failed:", err.message || err);
    return res.status(500).json({ message: "ไม่สามารถตั้งค่าโพยเป็นไม่ถูกรางวัลได้", error: err.message });
  }
});

// Get notifications for current user
app.get("/api/notifications", async (req, res) => {
  if (req.session?.guest) return res.json([]);
  const username = req.session?.username;
  const userId = req.session?.userId;
  if (hasDatabase()) {
    try {
      const notes = await fetchNotifications(userId);
      return res.json(notes);
    } catch (err) {
      console.error("fetch notifications failed:", err);
      return res.status(500).json({ message: "ไม่สามารถดึงแจ้งเตือนได้" });
    }
  }
  const list = fallbackNotifications.get(username) || [];
  return res.json(list);
});

// Mark notification read
app.post("/api/notifications/:id/read", async (req, res) => {
  if (req.session?.guest) return res.status(403).json({ message: "ต้องเป็นผู้ใช้งานจริง" });
  const id = req.params?.id;
  const username = req.session?.username;
  if (hasDatabase()) {
    try {
      await markNotificationRead(id, req.session.userId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("mark notification read failed:", err);
      return res.status(500).json({ message: "ไม่สามารถทำเครื่องหมายอ่านได้" });
    }
  }
  // demo fallback: find in fallbackNotifications and mark
  const list = fallbackNotifications.get(username) || [];
  const idx = list.findIndex((n) => String(n.id) === String(id));
  if (idx !== -1) {
    list[idx].read = true;
    fallbackNotifications.set(username, list);
  }
  return res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err instanceof multer.MulterError ? 413 : err.status === 400 ? 400 : 500;
  res.status(status).json({ message: status === 413 ? "ไฟล์ใหญ่เกินไปหรือจำนวนไฟล์ไม่ถูกต้อง" : "ไม่สามารถดำเนินการได้" });
});

app.listen(PORT, () => {
  console.log(`Demo API running on http://localhost:${PORT}`);
});
