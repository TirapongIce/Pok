import "dotenv/config";
import { upsertLotteryResult } from "../src/repositories/managementRepository.js";
import { pool } from "../src/db.js";

const rows = [
  { drawDate: "2025-12-13", threeTop: "611", twoTop: "11", twoBottom: "37" },
  { drawDate: "2025-12-12", threeTop: "748", twoTop: "48", twoBottom: "57" },
  { drawDate: "2025-12-11", threeTop: "202", twoTop: "02", twoBottom: "81" },
  { drawDate: "2025-12-10", threeTop: "644", twoTop: "44", twoBottom: "94" },
  { drawDate: "2025-12-09", threeTop: "502", twoTop: "02", twoBottom: "73" },
  { drawDate: "2025-12-08", threeTop: "447", twoTop: "47", twoBottom: "87" },
  { drawDate: "2025-12-07", threeTop: "885", twoTop: "85", twoBottom: "96" },
  { drawDate: "2025-12-06", threeTop: "707", twoTop: "07", twoBottom: "03" },
  { drawDate: "2025-12-05", threeTop: "824", twoTop: "24", twoBottom: "06" },
  { drawDate: "2025-12-04", threeTop: "463", twoTop: "63", twoBottom: "29" },
  { drawDate: "2025-12-03", threeTop: "260", twoTop: "60", twoBottom: "72" },
  { drawDate: "2025-12-02", threeTop: "411", twoTop: "11", twoBottom: "12" },
  { drawDate: "2025-12-01", threeTop: "780", twoTop: "80", twoBottom: "82" },
  { drawDate: "2025-11-30", threeTop: "085", twoTop: "85", twoBottom: "66" },
  { drawDate: "2025-11-29", threeTop: "382", twoTop: "82", twoBottom: "56" }
];

async function main() {
  if (!pool) {
    console.error("Database not configured, abort seeding.");
    return;
  }
  for (const row of rows) {
    await upsertLotteryResult({
      lotteryCode: "viet-vip",
      drawDate: row.drawDate,
      threeDigits: row.threeTop,
      twoDigits: row.twoBottom,
      extra: {
        twoTop: row.twoTop,
        twoBottom: row.twoBottom
      }
    });
    console.log(`Upserted viet-vip ${row.drawDate}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool?.end();
});
