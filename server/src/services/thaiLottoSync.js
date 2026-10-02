// ดึงผลสลากกินแบ่งรัฐบาลจาก API ของสำนักงานสลากฯ (GLO)
// เดิมใช้ lotto.api.rayriffy.com ซึ่งปิดให้บริการแล้ว (DNS ไม่มี record, repo ถูก archive)
import {
  upsertLotteryResult,
  fetchResultForDraw,
  countSettledTicketsForDraw,
  listDrawDatesAwaitingResult,
  listDrawDatesWithPendingTickets
} from "../repositories/managementRepository.js";
import { evaluateTicketsForDraw } from "./evaluateTickets.js";
import { bangkokDate, bangkokTime, isIsoDate } from "./lottoRules.js";

const GLO_API_BASE = process.env.GLO_API_BASE || "https://www.glo.or.th/api";
const REQUEST_TIMEOUT_MS = Number(process.env.GLO_API_TIMEOUT_MS || 15000);
const LOTTERY_CODE = "th-lottery";
// ผลออกครบประมาณ 16:00 น. ของวันออกรางวัล
const RESULT_READY_CLOCK = process.env.THAI_RESULT_READY_TIME || "16:00";

async function postGlo(path, body, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${GLO_API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`GLO ${path} HTTP ${response.status}`);
      const json = await response.json();
      if (json?.status === false) throw new Error(`GLO ${path} status=false: ${json?.statusMessage || ""}`);
      return json;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`เชื่อมต่อ GLO ไม่สำเร็จ: ${lastError?.cause?.code || lastError?.message || lastError}`);
}

function prizeValues(data, key) {
  const list = Array.isArray(data?.[key]?.number) ? data[key].number : [];
  return list
    .slice()
    .sort((a, b) => Number(a?.round ?? 0) - Number(b?.round ?? 0))
    .map((item) => String(item?.value ?? "").trim());
}

// แปลงผลจาก GLO เป็น payload ของ lottery_results; คืน null ถ้าผลยังไม่ครบ/รูปแบบไม่ถูกต้อง
export function mapGloResult(gloResult) {
  if (!gloResult || !isIsoDate(gloResult.date)) return null;
  const data = gloResult.data || {};
  const [firstPrize] = prizeValues(data, "first");
  const frontThree = prizeValues(data, "last3f");
  const backThree = prizeValues(data, "last3b");
  const [twoDigits] = prizeValues(data, "last2");
  const nearFirst = prizeValues(data, "near1");
  const complete =
    /^\d{6}$/.test(firstPrize ?? "") &&
    frontThree.length === 2 &&
    frontThree.every((n) => /^\d{3}$/.test(n)) &&
    backThree.length === 2 &&
    backThree.every((n) => /^\d{3}$/.test(n)) &&
    /^\d{2}$/.test(twoDigits ?? "");
  if (!complete) return null;
  return {
    lotteryCode: LOTTERY_CODE,
    drawDate: gloResult.date,
    firstPrize,
    frontThree,
    backThree,
    twoDigits,
    nearFirst: nearFirst.filter((n) => /^\d{6}$/.test(n)).slice(0, 2),
    extra: {
      source: "glo",
      period: gloResult.period ?? null,
      pdfUrl: gloResult.pdf_url ?? null,
      fetchedAt: new Date().toISOString()
    }
  };
}

export async function fetchLatestThaiResult() {
  const json = await postGlo("/lottery/getLatestLottery", {});
  return json?.response ?? null;
}

export async function fetchThaiResultByDate(isoDate) {
  const [year, month, date] = isoDate.split("-");
  const json = await postGlo("/checking/getLotteryResult", { date, month, year });
  return json?.response?.result ?? null;
}

function sameResult(a, b) {
  if (!a || !b) return false;
  const key = (r) =>
    JSON.stringify([r.firstPrize ?? null, [...(r.frontThree || [])].sort(), [...(r.backThree || [])].sort(), r.twoDigits ?? null]);
  return key(a) === key(b);
}

// บันทึกผล 1 งวด (กันเขียนทับผลที่ตรวจโพยไปแล้ว) แล้วตรวจโพยของงวดนั้นทันที
async function saveAndEvaluate(payload) {
  const existing = await fetchResultForDraw(payload.lotteryCode, payload.drawDate);
  if (existing && !sameResult(existing, payload)) {
    const settled = await countSettledTicketsForDraw(payload.lotteryCode, payload.drawDate);
    if (settled > 0) {
      return {
        saved: null,
        skipped: {
          drawDate: payload.drawDate,
          reason: `ผลในระบบต่างจาก GLO และมีโพยตรวจแล้ว ${settled} ใบ ต้องให้แอดมินตรวจสอบ`
        }
      };
    }
  }
  const saved = existing && sameResult(existing, payload) ? existing : await upsertLotteryResult(payload);
  let evaluation = null;
  try {
    evaluation = await evaluateTicketsForDraw(payload.lotteryCode, payload.drawDate);
  } catch (err) {
    evaluation = { error: err.message || String(err) };
  }
  return { saved, unchanged: Boolean(existing && sameResult(existing, payload)), evaluation };
}

// dates: งวดที่ต้องการดึงย้อนหลัง (YYYY-MM-DD), includeLatest: ดึงงวดล่าสุดด้วย
export async function syncThaiLottoFromApi({ dates = [], includeLatest = true } = {}) {
  const sources = [];
  if (includeLatest) sources.push({ id: "latest", load: fetchLatestThaiResult });
  for (const date of new Set(dates.filter(isIsoDate))) {
    sources.push({ id: date, load: () => fetchThaiResultByDate(date) });
  }

  const seen = new Set();
  const results = [];
  const skipped = [];
  const evaluations = [];
  for (const source of sources) {
    try {
      const raw = await source.load();
      const payload = mapGloResult(raw);
      if (!payload) {
        skipped.push({ id: source.id, reason: "ยังไม่มีผล หรือผลยังออกไม่ครบ" });
        continue;
      }
      if (seen.has(payload.drawDate)) continue;
      seen.add(payload.drawDate);
      const outcome = await saveAndEvaluate(payload);
      if (outcome.skipped) {
        skipped.push({ id: source.id, ...outcome.skipped });
        continue;
      }
      results.push({ ...outcome.saved, unchanged: outcome.unchanged });
      if (outcome.evaluation) evaluations.push({ drawDate: payload.drawDate, ...outcome.evaluation });
    } catch (err) {
      console.error(`[thai-sync] ${source.id} failed:`, err.message || err);
      skipped.push({ id: source.id, reason: err.message || "unknown" });
    }
  }
  return { source: "glo", totalFetched: sources.length, saved: results.length, results, skipped, evaluations };
}

// ทำงานเบื้องหลัง: ดึงผลงวดที่มีโพยค้างแต่ยังไม่มีผล และตรวจโพยงวดที่มีผลแล้วแต่ยังค้าง
export function startThaiResultScheduler({ intervalMs = Number(process.env.THAI_SYNC_INTERVAL_MS || 10 * 60 * 1000) } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const today = bangkokDate();
      const ready = (date) => date < today || (date === today && bangkokTime() >= RESULT_READY_CLOCK);
      const missing = (await listDrawDatesAwaitingResult(LOTTERY_CODE, today)).filter(ready);
      if (missing.length) {
        const outcome = await syncThaiLottoFromApi({ dates: missing, includeLatest: false });
        console.log(`[thai-sync] งวดที่รอผล ${missing.join(", ")} -> saved ${outcome.saved}, skipped ${outcome.skipped.length}`);
      }
      const pendingWithResult = await listDrawDatesWithPendingTickets(LOTTERY_CODE);
      for (const drawDate of pendingWithResult) {
        await evaluateTicketsForDraw(LOTTERY_CODE, drawDate).catch((err) =>
          console.error(`[thai-sync] evaluate ${drawDate} failed:`, err.message || err)
        );
      }
    } catch (err) {
      console.error("[thai-sync] scheduler tick failed:", err.message || err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  return timer;
}
