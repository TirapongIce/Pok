// กติกากลางของระบบหวย: งวด/เวลาปิดรับ (เวลาไทย), เลขที่ออก, การตรวจรางวัล, ความน่าจะเป็น (RTP)
// ทุกส่วน (แทงโพย, ตรวจผล, ยืนยันรางวัล, หน้าเรท) ต้องใช้ไฟล์นี้ เพื่อให้กติกาตรงกันทั้งระบบ

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BET_TYPE_DIGITS = {
  "three-top": 3,
  "three-tod": 3,
  "three-bottom": 3,
  "three-front": 3,
  "three-front-tod": 3,
  "two-top": 2,
  "two-bottom": 2,
  "two-tod": 2,
  "run-top": 1,
  "run-bottom": 1
};

export const BET_TYPE_LABELS = {
  "three-top": "3 ตัวบน",
  "three-tod": "3 ตัวโต๊ด",
  "three-bottom": "3 ตัวล่าง",
  "three-front": "3 ตัวหน้า",
  "three-front-tod": "3 ตัวหน้าโต๊ด",
  "two-top": "2 ตัวบน",
  "two-bottom": "2 ตัวล่าง",
  "two-tod": "2 ตัวโต๊ด",
  "run-top": "วิ่งบน",
  "run-bottom": "วิ่งล่าง"
};

// โอกาสถูกต่อ 1 รายการ (กรณีเลขไม่ซ้ำหลัก) ใช้คำนวณ RTP = rate × probability
const WIN_PROBABILITY = {
  "three-top": 1 / 1000,
  "three-tod": 6 / 1000,
  "three-bottom": 2 / 1000,
  "three-front": 2 / 1000,
  "three-front-tod": 12 / 1000,
  "two-top": 1 / 100,
  "two-bottom": 1 / 100,
  "two-tod": 2 / 100,
  "run-top": 1 - 0.9 ** 3,
  "run-bottom": 1 - 0.9 ** 2
};

export const MAX_RTP = 1;

// ---------- วันที่/เวลา (ยึดเวลาไทยเสมอ ไม่ขึ้นกับ TZ ของเครื่อง server) ----------

export function bangkokDate(date = new Date()) {
  return new Date(date.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

export function bangkokTime(date = new Date()) {
  return new Date(date.getTime() + BKK_OFFSET_MS).toISOString().slice(11, 16);
}

export function addDays(isoDate, days) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function closeAtFor(drawDate, hhmm) {
  return new Date(`${drawDate}T${hhmm}:00+07:00`);
}

// เวลาปิดรับ (HH:MM เวลาไทย) จาก closeTime ของหวย เช่น "2024-06-01T14:30:00+07:00" -> "14:30"
export function closeClockOf(closeTime) {
  if (!closeTime) return "23:59";
  const parsed = new Date(closeTime);
  if (Number.isNaN(parsed.getTime())) {
    const match = String(closeTime).match(/^(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "23:59";
  }
  return bangkokTime(parsed);
}

export function lotteryFamily(code) {
  const id = String(code || "").toLowerCase();
  if (id.startsWith("lao")) return "lao";
  if (id.startsWith("viet")) return "viet";
  return "thai";
}

function isScheduledDrawDay(code, isoDate) {
  const id = String(code || "").toLowerCase();
  const family = lotteryFamily(id);
  if (family === "lao") {
    const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    return dow === 1 || dow === 3 || dow === 5; // จันทร์ พุธ ศุกร์
  }
  if (family === "viet") return true; // ออกทุกวัน
  const day = Number(isoDate.slice(8, 10));
  return day === 1 || day === 16;
}

// rounds จากตาราง lottery_rounds ใช้ปรับตารางปกติ:
//   "2026-12-30" หรือ { date: "2026-12-30", close: "14:30" }  -> เพิ่มงวด
//   { date: "2027-01-16", skip: true }                         -> ยกเลิกงวดตามตารางปกติ
function parseRounds(rounds, defaultClock) {
  const added = new Map();
  const skipped = new Set();
  for (const entry of Array.isArray(rounds) ? rounds : []) {
    const date = typeof entry === "string" ? entry : entry?.date ?? entry?.drawDate;
    if (!isIsoDate(date)) continue;
    if (typeof entry === "object" && (entry.skip === true || entry.cancel === true)) {
      skipped.add(date);
      continue;
    }
    const close = typeof entry === "object" && /^\d{2}:\d{2}$/.test(entry?.close ?? "") ? entry.close : defaultClock;
    added.set(date, close);
  }
  return { added, skipped };
}

// งวดที่ยังเปิดรับ ณ เวลา now: { drawDate: "YYYY-MM-DD", closeAt: Date }
export function resolveOpenDraw({ code, closeTime, rounds, now = new Date() }) {
  const clock = closeClockOf(closeTime);
  const { added, skipped } = parseRounds(rounds, clock);
  let day = bangkokDate(now);
  for (let i = 0; i < 400; i += 1) {
    let closeAt = null;
    if (added.has(day)) closeAt = closeAtFor(day, added.get(day));
    else if (isScheduledDrawDay(code, day) && !skipped.has(day)) closeAt = closeAtFor(day, clock);
    if (closeAt && now < closeAt) return { drawDate: day, closeAt };
    day = addDays(day, 1);
  }
  return null;
}

// ---------- เลขที่ออก ----------

const digitsOf = (value) => (value == null ? "" : String(value).replace(/\D/g, ""));
const threeDigitList = (list) => (Array.isArray(list) ? list : []).map(digitsOf).filter((n) => n.length === 3);

// แปลงผลรางวัลเป็นเลขที่ใช้ตรวจแต่ละประเภท
// thai : 3 บน/2 บน = ท้ายรางวัลที่ 1, 2 ล่าง = twoDigits, 3 ล่าง = backThree, 3 หน้า = frontThree
// lao  : 3 บน/2 บน = ท้ายเลข 4 ตัว, 2 ล่าง = extra.twoBottom หรือ 2 ตัวหน้าของเลข 4 ตัว
// viet : 3 บน = threeDigits, 2 ล่าง = twoDigits
export function resolveWinningNumbers(lotteryCode, result) {
  if (!result) return null;
  const family = lotteryFamily(lotteryCode);
  const extra = result.extra && typeof result.extra === "object" ? result.extra : {};
  const first = digitsOf(result.firstPrize);
  const top3 = digitsOf(result.threeDigits) || (first.length >= 3 ? first.slice(-3) : "");
  let top2 = digitsOf(extra.twoTop) || (top3 ? top3.slice(-2) : "");
  let bottom2 = digitsOf(result.twoDigits);
  if (family === "lao") {
    top2 = digitsOf(extra.twoTop) || digitsOf(result.twoDigits) || top2;
    bottom2 = digitsOf(extra.twoBottom) || (first.length === 4 ? first.slice(0, 2) : "");
  }
  return {
    top3: top3.length === 3 ? top3 : "",
    top2: top2.length === 2 ? top2 : "",
    bottom2: bottom2.length === 2 ? bottom2 : "",
    front3: threeDigitList(result.frontThree),
    bottom3: threeDigitList(result.backThree)
  };
}

const sortDigits = (value) => String(value).split("").sort().join("");

// ผลมีข้อมูลพอสำหรับตรวจประเภทนี้หรือไม่ (ถ้าไม่พอ ต้องคงสถานะรอผล ห้ามตัดสินว่าไม่ถูก)
export function canSettleBetType(betType, winning) {
  if (!winning) return false;
  switch (betType) {
    case "three-top":
    case "three-tod":
    case "run-top":
      return Boolean(winning.top3);
    case "two-top":
    case "two-tod":
      return Boolean(winning.top2);
    case "two-bottom":
    case "run-bottom":
      return Boolean(winning.bottom2);
    case "three-bottom":
      return winning.bottom3.length > 0;
    case "three-front":
    case "three-front-tod":
      return winning.front3.length > 0;
    default:
      return false;
  }
}

export function isWinningBet(betType, number, winning) {
  if (!winning) return false;
  const n = String(number ?? "").trim();
  if (!isValidBetNumber(betType, n)) return false;
  switch (betType) {
    case "three-top":
      return n === winning.top3;
    case "three-tod":
      return Boolean(winning.top3) && sortDigits(n) === sortDigits(winning.top3);
    case "three-bottom":
      return winning.bottom3.includes(n);
    case "three-front":
      return winning.front3.includes(n);
    case "three-front-tod":
      return winning.front3.some((num) => sortDigits(num) === sortDigits(n));
    case "two-top":
      return n === winning.top2;
    case "two-bottom":
      return n === winning.bottom2;
    case "two-tod":
      return Boolean(winning.top2) && sortDigits(n) === sortDigits(winning.top2);
    case "run-top":
      return winning.top3.includes(n);
    case "run-bottom":
      return winning.bottom2.includes(n);
    default:
      return false;
  }
}

// ---------- ตรวจสอบโพย ----------

export function isKnownBetType(betType) {
  return Object.prototype.hasOwnProperty.call(BET_TYPE_DIGITS, betType);
}

export function isValidBetNumber(betType, number) {
  const digits = BET_TYPE_DIGITS[betType];
  if (!digits) return false;
  return new RegExp(`^\\d{${digits}}$`).test(String(number ?? ""));
}

// ---------- เลขอั้น / เลขปิด ----------

function matchesNumberPattern(pattern, value) {
  const raw = String(pattern ?? "").trim();
  const target = String(value ?? "").trim();
  if (!raw || !target) return false;
  if (raw === "*") return true;
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesNumberPattern(part, target));
  }
  if (raw.includes("-")) {
    const [start, end] = raw.split("-").map((part) => Number(part.trim()));
    const num = Number(target);
    if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(num)) {
      return num >= Math.min(start, end) && num <= Math.max(start, end);
    }
  }
  return raw === target;
}

// เลขอั้นที่ตรงที่สุด: เลขตรงตัว > ช่วง/รายการ > "*"
export function findRestriction(restrictions, { lotteryCode, betType, number }) {
  if (!Array.isArray(restrictions) || !restrictions.length) return null;
  const target = String(lotteryCode || "").toLowerCase();
  const applicable = restrictions.filter((nr) => {
    const code = String(nr.lotteryCode || "").toLowerCase();
    return (!code || code === "all" || code === target) && (!nr.betType || nr.betType === betType);
  });
  const value = String(number ?? "").trim();
  const literal = applicable.find((nr) => String(nr.number ?? "").trim() === value);
  if (literal) return literal;
  const pattern = applicable.find((nr) => {
    const raw = String(nr.number ?? "").trim();
    return raw && raw !== "*" && matchesNumberPattern(raw, value);
  });
  if (pattern) return pattern;
  return applicable.find((nr) => String(nr.number ?? "").trim() === "*") ?? null;
}

// ---------- เรทจ่าย ----------

export function winProbability(betType) {
  return WIN_PROBABILITY[betType] ?? null;
}

// RTP (อัตราคืนผู้เล่น) เช่น 0.95 = คืน 95% ของยอดแทง เจ้ามือได้ 5%
export function computeRtp(betType, rate) {
  const p = winProbability(betType);
  const r = Number(rate);
  if (p == null || !Number.isFinite(r)) return null;
  return Math.round(r * p * 10000) / 10000;
}

export function withRtp(rates) {
  return (rates || []).map((row) => ({ ...row, rate: Number(row.rate), rtp: computeRtp(row.betType, row.rate) }));
}
