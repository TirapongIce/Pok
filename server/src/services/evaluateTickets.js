import {
  fetchResultForDraw,
  fetchPayoutRates,
  listPendingTicketIdsForDraw,
  settleTicketItems,
  createNotification,
  hasDatabase
} from "../repositories/managementRepository.js";
import { resolveWinningNumbers, canSettleBetType, isWinningBet } from "./lottoRules.js";

// ตรวจโพยทุกใบของงวด แยกตรวจรายรายการ (purchase_logs) และจ่ายตามเรทของรายการนั้น
// ทำงานซ้ำได้อย่างปลอดภัย: รายการที่ตัดสินแล้วจะไม่ถูกตรวจ/จ่ายซ้ำ
export async function evaluateTicketsForDraw(lotteryCode, drawDate) {
  if (!hasDatabase()) {
    throw new Error("Database not enabled: evaluation only supported in DB mode");
  }
  const result = await fetchResultForDraw(lotteryCode, drawDate);
  if (!result) {
    throw new Error("ไม่มีผลรางวัลสำหรับงวดที่ระบุ");
  }
  const winning = resolveWinningNumbers(lotteryCode, result);
  const rates = await fetchPayoutRates(lotteryCode).catch(() => []);
  const rateByType = new Map(rates.map((r) => [r.betType, Number(r.rate)]));
  const ticketIds = await listPendingTicketIdsForDraw(lotteryCode, drawDate);

  let evaluated = 0;
  let winners = 0;
  let totalPayout = 0;
  const details = [];

  for (const ticketId of ticketIds) {
    try {
      const outcome = await settleTicketItems(ticketId, {
        decide: (item) => {
          if (item.status && item.status !== "pending") return null;
          if (!canSettleBetType(item.betType, winning)) {
            return { status: "pending", reason: "ผลรางวัลไม่มีข้อมูลสำหรับประเภทนี้" };
          }
          if (!isWinningBet(item.betType, item.number, winning)) {
            return { status: "lost" };
          }
          const rate = item.payoutRate != null ? Number(item.payoutRate) : rateByType.get(item.betType);
          if (rate == null || !Number.isFinite(rate)) {
            return { status: "pending", reason: "ไม่พบเรทจ่าย" };
          }
          return { status: "won", rate };
        }
      });
      if (!outcome) continue;
      evaluated += 1;
      if (outcome.payout > 0) {
        winners += 1;
        totalPayout += outcome.payout;
        const wonNumbers = outcome.items.filter((it) => it.status === "won").map((it) => it.number);
        createNotification({
          userId: outcome.userId,
          type: "winner",
          title: "ถูกรางวัล",
          message: `โพย #${ticketId} ถูกรางวัล (${wonNumbers.join(", ")}) รับ ${outcome.payout.toLocaleString()} บาท`,
          meta: { ticketId, payoutAmount: outcome.payout }
        }).catch((err) => console.error("create notification failed for ticket", ticketId, err.message || err));
      }
      details.push({
        ticketId,
        username: outcome.username,
        status: outcome.status,
        amount: outcome.amount,
        payoutAmount: outcome.payout,
        items: outcome.items
      });
    } catch (err) {
      console.error("evaluation error for ticket", ticketId, err.message || err);
      details.push({ ticketId, error: err.message || "error" });
    }
  }

  return { lotteryCode, drawDate, evaluated, winners, totalPayout, details };
}

export default { evaluateTicketsForDraw };
