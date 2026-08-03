import {
  fetchResultForDraw,
  fetchPendingTicketsForDraw,
  fetchPayoutRates,
  listNumberRestrictions,
  markTicketResult,
  applyPayoutToUser,
  createNotification,
  hasDatabase
} from "../repositories/managementRepository.js";

function isPermutation(a, b) {
  return a.split("").sort().join("") === b.split("").sort().join("");
}

function asString(value) {
  if (Array.isArray(value)) return value.join(",");
  return value == null ? "" : String(value);
}

function matchesNumberPattern(pattern, value) {
  const target = asString(value).trim();
  const raw = asString(pattern).trim();
  if (!raw || !target) return false;
  if (raw === "*") return true;
  // support comma-separated values
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesNumberPattern(part, target));
  }
  // support numeric ranges, e.g. "0-99"
  if (raw.includes("-")) {
    const [startStr, endStr] = raw.split("-").map((part) => part.trim());
    const start = Number(startStr);
    const end = Number(endStr);
    const valueNum = Number(target);
    if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(valueNum)) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      return valueNum >= min && valueNum <= max;
    }
  }
  return raw === target;
}

function resolveRestrictedRate(restrictions, { lotteryCode, betType, number }) {
  if (!Array.isArray(restrictions) || !restrictions.length) return null;
  const targetLottery = (lotteryCode || "").toLowerCase();
  const applicable = restrictions.filter((nr) => {
    const lotteryMatch =
      !nr.lotteryCode || nr.lotteryCode === "all" || targetLottery === (nr.lotteryCode || "").toLowerCase();
    const betTypeMatch = !nr.betType || nr.betType === betType;
    return lotteryMatch && betTypeMatch;
  });
  const specific = applicable.find(
    (nr) =>
      nr?.number &&
      String(nr.number).trim() !== "*" &&
      matchesNumberPattern(nr.number, number) &&
      nr.payoutRate != null
  );
  if (specific) return Number(specific.payoutRate);
  const wildcard = applicable.find((nr) => String(nr.number || "").trim() === "*" && nr.payoutRate != null);
  if (wildcard) return Number(wildcard.payoutRate);
  return null;
}

export async function evaluateTicketsForDraw(lotteryCode, drawDate) {
  if (!hasDatabase()) {
    throw new Error("Database not enabled: evaluation only supported in DB mode");
  }
  const result = await fetchResultForDraw(lotteryCode, drawDate);
  if (!result) {
    throw new Error("ไม่มีผลรางวัลสำหรับงวดที่ระบุ");
  }

  const isThai = (lotteryCode || "").toLowerCase().includes("th-lottery") || (lotteryCode || "").toLowerCase().includes("thai");
  const prizeStr = result.firstPrize ? String(result.firstPrize) : "";
  const frontNumbers = (() => {
    const list = [];
    if (isThai && prizeStr.length >= 3) {
      list.push(prizeStr.slice(0, 3));
    } else if (Array.isArray(result.frontThree) && result.frontThree.length) {
      list.push(...result.frontThree.filter(Boolean));
    } else if (prizeStr.length >= 3) {
      list.push(prizeStr.slice(0, 3));
    }
    return Array.from(new Set(list));
  })();
  const backNumbers =
    Array.isArray(result.backThree) && result.backThree.length
      ? result.backThree.filter(Boolean)
      : prizeStr.length >= 3
        ? [prizeStr.slice(-3)]
        : [];

  const payoutRates = await fetchPayoutRates(lotteryCode).catch(() => []);
  const numberRestrictions = await listNumberRestrictions({ lotteryCode }).catch(() => []);
  const pending = await fetchPendingTicketsForDraw(lotteryCode, drawDate);

  let evaluated = 0;
  let winners = 0;
  let totalPayout = 0;
  const details = [];

  for (const ticket of pending) {
    evaluated += 1;
    const numbersList = (Array.isArray(ticket.numbers) ? ticket.numbers : [ticket.numbers]).filter(Boolean);
    const fallbackNumber = numbersList.length ? asString(numbersList[0]).trim() : "";
    let matched = false;
    let matchedRate = null;
    let matchedNumber = null;

    try {
      for (const rawNum of numbersList) {
        const cleaned = asString(rawNum).trim();
        if (!cleaned) continue;
        const betType = String(ticket.betType || "");
        if (cleaned.length === 3) {
          // three-digit checks
          const isFrontBet = betType.includes("front");
          const isBackBet = betType.includes("back");
          const isTodBet = betType.includes("tod");
          if (!isFrontBet && !isBackBet && result.threeDigits && cleaned === result.threeDigits) {
            matched = true;
          } else if (frontNumbers.length && frontNumbers.includes(cleaned) && isFrontBet) {
            matched = true;
          } else if (backNumbers.length && backNumbers.includes(cleaned) && isBackBet) {
            matched = true;
          } else if (isTodBet) {
            if (!isFrontBet && !isBackBet && result.threeDigits && isPermutation(cleaned, result.threeDigits)) {
              matched = true;
            }
            if (!matched && isFrontBet && frontNumbers.some((num) => isPermutation(cleaned, num))) {
              matched = true;
            }
            if (!matched && isBackBet && backNumbers.some((num) => isPermutation(cleaned, num))) {
              matched = true;
            }
          }
        } else if (cleaned.length === 2) {
          if (result.twoDigits && cleaned === result.twoDigits) {
            matched = true;
          }
        }

        if (matched) {
          matchedNumber = cleaned;
          // determine rate
          const restrictedRate = resolveRestrictedRate(numberRestrictions, {
            lotteryCode,
            betType: ticket.betType,
            number: cleaned
          });
          const byType =
            payoutRates.find((r) => r.betType === ticket.betType) ||
            payoutRates.find((r) => r.betType === (cleaned.length === 3 ? "three-top" : "two-top"));
          matchedRate =
            ticket.payoutRate != null
              ? Number(ticket.payoutRate)
              : restrictedRate != null
                ? restrictedRate
                : byType
                  ? Number(byType.rate)
                  : null;
          const payoutAmount = matchedRate ? Number(ticket.amount) * matchedRate : 0;

          // mark ticket and apply payout
          await markTicketResult(ticket.id, "won", matchedRate);
          try {
            await applyPayoutToUser(ticket.userId, payoutAmount);
          } catch (err) {
            // log but continue
            console.error("apply payout failed for ticket", ticket.id, err.message || err);
          }
          // create an in-app notification for the winner (DB may or may not persist)
          try {
            const title = "ถูกรางวัล";
            const message = `โพยหมายเลข ${cleaned} ถูกรางวัล รับ ${payoutAmount} `;
            await createNotification({ userId: ticket.userId, type: "winner", title, message, meta: { ticketId: ticket.id, payoutAmount } });
          } catch (err) {
            console.error("create notification failed for ticket", ticket.id, err.message || err);
          }
          winners += 1;
          totalPayout += payoutAmount;
          details.push({ ticketId: ticket.id, username: ticket.username, numbers: cleaned, amount: ticket.amount, payoutRate: matchedRate, payoutAmount });
          break;
        }
      }
      if (!matched) {
        // mark as lost
        await markTicketResult(ticket.id, "lost", null);
        details.push({ ticketId: ticket.id, username: ticket.username, numbers: fallbackNumber, amount: ticket.amount, payoutRate: null, payoutAmount: 0 });
      }
    } catch (err) {
      console.error("evaluation error for ticket", ticket.id, err.message || err);
      details.push({ ticketId: ticket.id, error: err.message || "error" });
    }
  }

  return {
    lotteryCode,
    drawDate,
    evaluated,
    winners,
    totalPayout,
    details
  };
}

export default { evaluateTicketsForDraw };
