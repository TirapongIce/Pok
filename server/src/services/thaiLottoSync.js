import { upsertLotteryResult } from "../repositories/managementRepository.js";

const LOTTO_API_BASE = "https://lotto.api.rayriffy.com";

const thaiMonths = {
  มกราคม: "01",
  กุมภาพันธ์: "02",
  มีนาคม: "03",
  เมษายน: "04",
  พฤษภาคม: "05",
  มิถุนายน: "06",
  กรกฎาคม: "07",
  สิงหาคม: "08",
  กันยายน: "09",
  ตุลาคม: "10",
  พฤศจิกายน: "11",
  ธันวาคม: "12"
};

function toIsoDate(thaiDateString) {
  if (!thaiDateString) return null;
  const parts = thaiDateString.trim().split(" ");
  if (parts.length < 3) return null;
  const [dayRaw, monthTh, yearTh] = parts;
  const day = dayRaw.padStart(2, "0");
  const month = thaiMonths[monthTh];
  const year = String(Number(yearTh) - 543);
  if (!month || !Number(year)) return null;
  return `${year}-${month}-${day}`;
}

function toIsoDateFromId(id) {
  if (!id || id.length !== 8) return null;
  const day = id.slice(0, 2);
  const month = id.slice(2, 4);
  const yearTh = id.slice(4);
  const year = String(Number(yearTh) - 543);
  if (!year || Number.isNaN(Number(year))) return null;
  return `${year}-${month}-${day}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`request failed (${response.status})`);
  }
  return response.json();
}

async function fetchThaiDrawIds({ pages = 2, max = 20 } = {}) {
  const ids = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await fetchJson(`${LOTTO_API_BASE}/list/${page}`);
    if (data?.status !== "success" || !Array.isArray(data?.response)) continue;
    for (const item of data.response) {
      if (!item?.id) continue;
      ids.push(item.id);
      if (ids.length >= max) return ids;
    }
  }
  return ids;
}

function mapThaiResponseToPayload(apiData) {
  if (!apiData?.status || apiData.status !== "success") return null;
  const res = apiData.response || {};
  const endpointId = typeof res?.endpoint === "string" ? res.endpoint.split("/").pop()?.replace(/\D/g, "") : null;
  const drawDate = toIsoDate(res.date) || toIsoDateFromId(endpointId);
  const prizeFirst = Array.isArray(res.prizes?.[0]?.number)
    ? res.prizes[0].number.join(",")
    : res.prizes?.[0]?.number || null;

  // skip future draws that still contain masked numbers (xxxxxx)
  if (!prizeFirst || /x/i.test(prizeFirst)) return null;

  const running = Array.isArray(res.runningNumbers) ? res.runningNumbers : [];
  const frontThree = running?.[0]?.number || [];
  const backThree = running?.[1]?.number || [];
  const backTwo = running?.[2]?.number || [];

  const nearFirst = Array.isArray(res.nearbyNumber) ? res.nearbyNumber : [];

  return {
    lotteryCode: "th-lottery",
    drawDate,
    firstPrize: prizeFirst,
    frontThree: Array.isArray(frontThree) ? frontThree.slice(0, 2) : [],
    backThree: Array.isArray(backThree) ? backThree.slice(0, 2) : [],
    twoDigits: Array.isArray(backTwo) ? backTwo[0] : backTwo || null,
    nearFirst: Array.isArray(nearFirst) ? nearFirst.slice(0, 2) : []
  };
}

export async function syncThaiLottoFromApi({ pages = 2, max = 10 } = {}) {
  const ids = await fetchThaiDrawIds({ pages, max });
  const seenDates = new Set();
  const saved = [];
  const skipped = [];
  for (const id of ids) {
    try {
      const detail = await fetchJson(`${LOTTO_API_BASE}/lotto/${id}`);
      const payload = mapThaiResponseToPayload(detail);
      if (!payload?.drawDate) {
        skipped.push({ id, reason: "missing draw date or masked numbers" });
        continue;
      }
      if (seenDates.has(payload.drawDate)) {
        skipped.push({ id, reason: "duplicate drawDate" });
        continue;
      }
      const savedResult = await upsertLotteryResult(payload);
      saved.push(savedResult);
      seenDates.add(payload.drawDate);
    } catch (err) {
      console.error(`sync thai lotto ${id} failed:`, err.message || err);
      skipped.push({ id, reason: err.message || "unknown" });
    }
  }
  return { totalFetched: ids.length, saved: saved.length, results: saved, skipped };
}
