#!/usr/bin/env node
// QA full-loop test: auth -> rates -> buy -> sync result (GLO) -> evaluate -> payout -> admin override -> cancel
// Usage:
//   BASE=http://localhost:4001 PSQL="docker exec -i <pg-container> psql -U <user> -d <db>" node scripts/qaFullLoop.mjs
// PSQL is optional; steps that move tickets to a past draw (to test against a real published result) are skipped without it.
// Run against a TEST database only: the script creates users, tickets and results.
import { execSync } from "node:child_process";

const BASE = process.env.BASE || "http://localhost:4001";
const PSQL = process.env.PSQL || "";
const ADMIN_USER = process.env.HUAY_SUPERADMIN_USER || "superadmin";
const ADMIN_PASS = process.env.HUAY_SUPERADMIN_PASSWORD || "Sup3rDemo!";
// Expected fixture: 1st 402701, 3-front 791/912, 3-back 058/396, 2-bottom 70.
// Fixture values are synthetic when run through runQa.mjs, not proof of official results.
const PAST_DRAW = process.env.QA_PAST_DRAW || "2026-10-01";
const SCHEDULER_DRAW = process.env.QA_SCHEDULER_DRAW || "2026-09-16"; // 1st 730640

const results = [];
const check = (id, ok, label, extra) => {
  results.push({ id, ok, label });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${label}${extra !== undefined ? " :: " + JSON.stringify(extra) : ""}`);
};
const skip = (id, label) => {
  results.push({ id, ok: true, skipped: true, label });
  console.log(`SKIP [${id}] ${label}`);
};
const sql = (query) => {
  if (!PSQL) return null;
  const out = execSync(`${PSQL} -At -c "SET search_path TO lotto_demo, public; ${query.replace(/"/g, '\\"')}"`, { encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line && !/^(SET|UPDATE \d+|DELETE \d+|INSERT \d+ \d+)$/.test(line))
    .join("\n")
    .trim();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, { token, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "x-session-token": token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}
const login = async (username, password) =>
  (await call("/api/auth/login", { method: "POST", body: { username, password } })).json;

let admin;
async function available(userId) {
  const r = await call("/api/admin/members", { token: admin });
  const u = (Array.isArray(r.json) ? r.json : []).find((m) => String(m.id) === String(userId));
  return u ? Math.round((Number(u.creditLimit) - Number(u.creditUsed ?? 0)) * 100) / 100 : null;
}
async function newMember(prefix, deposit) {
  const username = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const created = (await call("/api/admin/users", { token: admin, method: "POST", body: { username, password: "QaPass123!", role: "agent", creditLimit: 0 } })).json;
  if (deposit) await call(`/api/admin/users/${created.id}/deposit`, { token: admin, method: "POST", body: { amount: deposit } });
  const token = (await login(username, "QaPass123!")).token;
  return { id: created.id, username, token };
}
const buy = (token, lotteryId, items, extra = {}) =>
  call("/api/purchases", {
    token,
    method: "POST",
    body: { lotteryId, bets: items.map((i) => i.number), amount: items.reduce((s, i) => s + i.amount, 0), meta: { items }, ...extra }
  });

async function main() {
  // ---------------- 1. AUTH ----------------
  check("SEC-1", (await call("/api/admin/members")).status === 401, "anonymous GET /api/admin/members -> 401");
  check("SEC-2", (await call("/api/admin/payout-rates/th-lottery", { method: "PUT", body: [] })).status === 401, "anonymous PUT payout-rates -> 401");
  admin = (await login(ADMIN_USER, ADMIN_PASS)).token;
  check("SEC-0", Boolean(admin), "superadmin login");
  const lotteriesRes = await call("/api/lotteries");
  const thai = (lotteriesRes.json || []).find((l) => l.id === "th-lottery");
  check("SEC-3", lotteriesRes.status === 200 && Boolean(thai?.currentDrawDate), "public GET /api/lotteries returns current draw", { draw: thai?.currentDrawDate, closeAt: thai?.currentCloseAt });

  const alice = await newMember("qa", 100000);
  const bob = await newMember("qb", 1000);
  check("SEC-4", (await call("/api/admin/members", { token: alice.token })).status === 403, "member GET /api/admin/members -> 403");
  check("SEC-5", (await call("/api/admin/payout-rates/th-lottery", { token: alice.token, method: "PUT", body: [] })).status === 403, "member PUT payout-rates -> 403");
  check("SEC-6", (await call("/api/admin/sync/thai-lottery", { token: alice.token, method: "POST", body: {} })).status === 403, "member cannot trigger sync");

  // ---------------- 2. RATES ----------------
  const rates = (await call("/api/lotteries/th-lottery/payout-rates")).json;
  const rateOf = (t) => Number(rates.find((r) => r.betType === t)?.rate);
  check("RATE-1", rates.length > 0 && rates.every((r) => r.rtp != null && r.rtp <= 1), "all Thai rates have RTP <= 100%", Object.fromEntries(rates.map((r) => [r.betType, `${r.rate} (${(r.rtp * 100).toFixed(1)}%)`])));
  const badRates = rates.map((r) => ({ betType: r.betType, rate: r.betType === "three-front-tod" ? 90 : Number(r.rate) }));
  const putBad = await call("/api/admin/payout-rates/th-lottery", { token: admin, method: "PUT", body: badRates });
  check("RATE-2", putBad.status === 400, "rate with RTP > 100% (3 หน้าโต๊ด 90) is rejected", putBad.json?.message);
  const putGood = await call("/api/admin/payout-rates/th-lottery", { token: admin, method: "PUT", body: rates.map(({ betType, rate }) => ({ betType, rate })) });
  check("RATE-3", putGood.status === 200, "valid rates are saved");

  // ---------------- 3. BUY ----------------
  const drawNow = thai.currentDrawDate;
  const c0 = await available(alice.id);
  const t1 = await buy(alice.token, "th-lottery", [
    { number: "123", betType: "three-top", amount: 10 },
    { number: "45", betType: "two-bottom", amount: 20 }
  ]);
  check("BUY-1", t1.status === 201 && t1.json.drawDate === drawNow && t1.json.items.length === 2, "multi-type ticket accepted for current draw", { status: t1.status, drawDate: t1.json.drawDate, msg: t1.json.message });
  check("BUY-2", (await available(alice.id)) === c0 - 30, "credit reduced by exact ticket total");
  const cheat = await call("/api/purchases", { token: alice.token, method: "POST", body: { lotteryId: "th-lottery", bets: ["999"], amount: 1, meta: { items: [{ number: "999", betType: "three-top", amount: 5000 }] } } });
  check("BUY-3", cheat.status === 400, "items total != amount paid -> rejected", cheat.json?.message);
  check("BUY-4", (await buy(alice.token, "th-lottery", [{ number: "12a", betType: "three-top", amount: 10 }])).status === 400, "invalid number '12a' -> rejected");
  check("BUY-5", (await buy(alice.token, "th-lottery", [{ number: "1234", betType: "three-top", amount: 10 }])).status === 400, "4-digit number for three-top -> rejected");
  check("BUY-6", (await buy(alice.token, "th-lottery", [{ number: "12", betType: "two-top", amount: 1 }])).status === 400, "below minBet -> rejected");
  check("BUY-7", (await buy(alice.token, "lao-lottery", [{ number: "123", betType: "three-front", amount: 10 }])).status === 400, "bet type not offered by lottery -> rejected");

  await call("/api/admin/number-restrictions", { token: admin, method: "POST", body: { lotteryCode: "th-lottery", betType: "two-top", number: "44", payoutRate: 0, note: "เลขปิด" } });
  const closed = await buy(alice.token, "th-lottery", [{ number: "44", betType: "two-top", amount: 10 }]);
  check("BUY-8", closed.status === 400, "closed number (rate 0) -> rejected", closed.json?.message);

  // ใช้เลขสุ่มต่อรอบ เพราะยอดอั้นสะสมทั้งงวด (รันซ้ำบนฐานข้อมูลเดิมได้)
  const capNumber = String(10 + (Date.now() % 34)).padStart(2, "0");
  await call("/api/admin/number-restrictions", { token: admin, method: "POST", body: { lotteryCode: "th-lottery", betType: "two-top", number: capNumber, payoutRate: 50, maxAmount: 100, note: "เลขอั้น" } });
  const lim1 = await buy(alice.token, "th-lottery", [{ number: capNumber, betType: "two-top", amount: 80 }]);
  check("BUY-9", lim1.status === 201 && lim1.json.items[0].payoutRate === 50, "restricted number accepted at reduced rate 50", { status: lim1.status, rate: lim1.json.items?.[0]?.payoutRate, msg: lim1.json.message });
  const lim2 = await buy(bob.token, "th-lottery", [{ number: capNumber, betType: "two-top", amount: 30 }]);
  check("BUY-10", lim2.status === 400, "per-draw cap (maxAmount 100) enforced across users", lim2.json?.message);

  const bobBefore = await available(bob.id);
  const burst = await Promise.all(Array.from({ length: 8 }, () => buy(bob.token, "th-lottery", [{ number: "777", betType: "three-top", amount: 200 }])));
  const okCount = burst.filter((r) => r.status === 201).length;
  const bobAfter = await available(bob.id);
  check("BUY-11", okCount === 5 && bobAfter === bobBefore - 1000 && bobAfter >= 0, "8 concurrent buys of 200 with 1,000 credit -> exactly 5 succeed, no negative credit", { okCount, bobAfter });

  // ---------------- 4. CANCEL ----------------
  const cBeforeCancel = await available(alice.id);
  const cancel1 = await call(`/api/tickets/${t1.json.id}/cancel`, { token: alice.token, method: "POST" });
  const cancel2 = await call(`/api/tickets/${t1.json.id}/cancel`, { token: alice.token, method: "POST" });
  const cAfterCancel = await available(alice.id);
  check("CAN-1", cancel1.status === 200 && cancel2.status === 400 && cAfterCancel === cBeforeCancel + 30, "cancel refunds once; second cancel rejected", { first: cancel1.status, second: cancel2.status });
  check("CAN-2", (await call(`/api/tickets/${lim1.json.id}/cancel`, { token: bob.token, method: "POST" })).status === 403, "cannot cancel another member's ticket");

  // ---------------- 5. RESULT VALIDATION ----------------
  const badResult = await call("/api/admin/lottery-results", { token: admin, method: "POST", body: { lotteryCode: "th-lottery", drawDate: "2030-01-01", firstPrize: "12a456" } });
  check("RES-1", badResult.status === 400, "malformed result rejected", badResult.json?.message);

  // ---------------- 6. SYNC + EVALUATE (real GLO result) ----------------
  if (!PSQL) {
    skip("EVAL-*", "PSQL not set: cannot move tickets to a past draw");
  } else {
    const winItems = [
      { number: "701", betType: "three-top", amount: 10 }, // 950 -> 9,500
      { number: "107", betType: "three-tod", amount: 10 }, // 150 -> 1,500
      { number: "01", betType: "two-top", amount: 10 }, // 95 -> 950
      { number: "70", betType: "two-bottom", amount: 10 }, // 95 -> 950
      { number: "058", betType: "three-bottom", amount: 10 }, // 450 -> 4,500
      { number: "912", betType: "three-front", amount: 10 }, // 450 -> 4,500
      { number: "197", betType: "three-front-tod", amount: 10 }, // 75 -> 750
      { number: "7", betType: "run-top", amount: 10 }, // 3.2 -> 32
      { number: "0", betType: "run-bottom", amount: 10 }, // 4.2 -> 42
      { number: "123", betType: "three-top", amount: 10 },
      { number: "99", betType: "two-top", amount: 10 },
      { number: "5", betType: "run-bottom", amount: 10 }
    ];
    const expected =
      10 * (rateOf("three-top") + rateOf("three-tod") + rateOf("two-top") + rateOf("two-bottom") + rateOf("three-bottom") +
        rateOf("three-front") + rateOf("three-front-tod") + rateOf("run-top") + rateOf("run-bottom"));
    const winTicket = await buy(alice.token, "th-lottery", winItems);
    check("EVAL-0", winTicket.status === 201, "12-line ticket accepted", winTicket.json?.message);
    // legacy ticket without purchase_logs (old data format)
    sql(`INSERT INTO tickets (user_id, lottery_code, bet_type, numbers, amount, status, draw_date) VALUES (${alice.id}, 'th-lottery', 'three-top', '["701","555"]', 20, 'pending', '${PAST_DRAW}')`);
    sql(`UPDATE tickets SET draw_date = '${PAST_DRAW}' WHERE id = ${winTicket.json.id}; UPDATE purchase_logs SET draw_date = '${PAST_DRAW}' WHERE ticket_id = ${winTicket.json.id}`);
    sql(`DELETE FROM lottery_results WHERE lottery_code = 'th-lottery' AND draw_date = '${PAST_DRAW}'`);

    const before = await available(alice.id);
    const sync = await call("/api/admin/sync/thai-lottery", { token: admin, method: "POST", body: { dates: [PAST_DRAW], includeLatest: true } });
    const saved = (sync.json.results || []).find((r) => r.drawDate === PAST_DRAW);
    check("SYNC-1", sync.status === 200 && saved?.firstPrize === "402701", "sync from GLO saves real result", { status: sync.status, saved: sync.json.saved, skipped: sync.json.skipped });
    check("SYNC-2", JSON.stringify(saved?.frontThree) === '["791","912"]' && JSON.stringify(saved?.backThree) === '["058","396"]' && saved?.twoDigits === "70", "3-front / 3-back / 2-bottom stored as published", { front: saved?.frontThree, back: saved?.backThree, two: saved?.twoDigits });
    const after = await available(alice.id);
    const legacyExpected = 10 * rateOf("three-top");
    check("EVAL-1", Math.abs(after - before - (expected + legacyExpected)) < 0.01, "each winning line paid at its own rate (incl. legacy ticket)", { expected: expected + legacyExpected, actual: after - before });
    const ledger = (await call("/api/admin/credit-ledger", { token: alice.token })).json;
    const row = ledger.find((t) => String(t.id) === String(winTicket.json.id));
    const wonCount = (row?.items || []).filter((i) => i.status === "won").length;
    const lostCount = (row?.items || []).filter((i) => i.status === "lost").length;
    check("EVAL-2", row?.status === "won" && wonCount === 9 && lostCount === 3 && Math.abs(row.credit - expected) < 0.01, "ledger shows 9 won / 3 lost lines and correct credit", { status: row?.status, wonCount, lostCount, credit: row?.credit });
    check("EVAL-3", ledger.every((t) => t.member === alice.username), "member ledger only contains own tickets");

    const again = await call(`/api/admin/lottery-results/th-lottery/${PAST_DRAW}/evaluate`, { token: admin, method: "POST" });
    check("EVAL-4", again.status === 200 && (await available(alice.id)) === after, "re-evaluating the draw pays nothing extra", { evaluated: again.json.evaluated });

    const cw1 = await call(`/api/admin/tickets/${winTicket.json.id}/confirm-win`, { token: admin, method: "POST", body: {} });
    check("PAY-1", cw1.status === 400 && (await available(alice.id)) === after, "confirm-win without items on settled ticket -> rejected, no payout", cw1.json?.message);
    const lostItem = row.items.find((i) => i.status === "lost");
    const cw2 = await call(`/api/admin/tickets/${winTicket.json.id}/confirm-win`, { token: admin, method: "POST", body: { items: [{ id: lostItem.id }] } });
    const afterOverride = await available(alice.id);
    const cw3 = await call(`/api/admin/tickets/${winTicket.json.id}/confirm-win`, { token: admin, method: "POST", body: { items: [{ id: lostItem.id }] } });
    check("PAY-2", cw2.status === 200 && cw3.status === 400 && (await available(alice.id)) === afterOverride, "admin override pays a selected line once only", { first: cw2.json?.payoutAmount, second: cw3.status });
    const wonItem = row.items.find((i) => i.status === "won");
    await call(`/api/admin/tickets/${winTicket.json.id}/confirm-lose`, { token: admin, method: "POST", body: { items: [{ id: wonItem.id }] } });
    const ledger2 = (await call("/api/admin/credit-ledger", { token: alice.token })).json;
    const still = ledger2.find((t) => String(t.id) === String(winTicket.json.id))?.items.find((i) => String(i.id) === String(wonItem.id));
    check("PAY-3", still?.status === "won", "confirm-lose cannot revert a paid line");

    const conflict = await call("/api/admin/lottery-results", { token: admin, method: "POST", body: { lotteryCode: "th-lottery", drawDate: PAST_DRAW, firstPrize: "111111", frontThree: ["111", "222"], backThree: ["333", "444"], twoDigits: "11" } });
    check("RES-2", conflict.status === 409, "changing a result of an already-settled draw requires force", conflict.json?.message);

    // ---------------- 7. SCHEDULER (auto sync of a draw that has pending tickets) ----------------
    const schedTicket = await buy(alice.token, "th-lottery", [{ number: "640", betType: "three-top", amount: 10 }]);
    sql(`UPDATE tickets SET draw_date = '${SCHEDULER_DRAW}' WHERE id = ${schedTicket.json.id}; UPDATE purchase_logs SET draw_date = '${SCHEDULER_DRAW}' WHERE ticket_id = ${schedTicket.json.id}`);
    sql(`DELETE FROM lottery_results WHERE lottery_code = 'th-lottery' AND draw_date = '${SCHEDULER_DRAW}'`);
    let schedStatus = "pending";
    for (let i = 0; i < 20 && schedStatus === "pending"; i += 1) {
      await sleep(3000);
      schedStatus = sql(`SELECT status FROM tickets WHERE id = ${schedTicket.json.id}`);
    }
    check("SCHED-1", schedStatus === "won", "background scheduler fetched missing draw and settled ticket", { schedStatus });
  }

  // ---------------- 8. NO BETTING ON A PUBLISHED DRAW ----------------
  const viet = (await call("/api/lotteries/viet-standard")).json;
  if (viet?.currentDrawDate) {
    await call("/api/admin/lottery-results", { token: admin, method: "POST", body: { lotteryCode: "viet-standard", drawDate: viet.currentDrawDate, threeDigits: "123", twoDigits: "45" } });
    const late = await buy(alice.token, "viet-standard", [{ number: "123", betType: "three-top", amount: 10 }]);
    check("LATE-1", late.status === 400, "cannot bet on a draw whose result is published", late.json?.message);
  }

  // ---------------- 9. MISC ----------------
  const latest = await call("/api/lottery-results/latest");
  check("MISC-1", latest.status === 200 && typeof latest.json === "object", "latest results endpoint responds", { th: latest.json?.["th-lottery"]?.drawDate });
  const newLottery = await call("/api/admin/lotteries", { token: admin, method: "POST", body: { code: `qa-${Date.now().toString(36)}`, name: "QA Lottery" } });
  check("MISC-2", newLottery.status === 201, "admin can create a lottery", newLottery.json?.message);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(", ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("CRASH", err);
  process.exit(2);
});
