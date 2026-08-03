import "dotenv/config";
import { upsertLotteryResult } from "../src/repositories/managementRepository.js";
import { pool } from "../src/db.js";

const rows = [
  { drawDate: "2025-12-13", threeTop: "671", twoTop: "71", twoBottom: "41" },
  { drawDate: "2025-12-12", threeTop: "694", twoTop: "94", twoBottom: "48" },
  { drawDate: "2025-12-11", threeTop: "107", twoTop: "07", twoBottom: "65" },
  { drawDate: "2025-12-10", threeTop: "704", twoTop: "04", twoBottom: "67" },
  { drawDate: "2025-12-09", threeTop: "857", twoTop: "57", twoBottom: "19" },
  { drawDate: "2025-12-08", threeTop: "360", twoTop: "60", twoBottom: "49" },
  { drawDate: "2025-12-07", threeTop: "394", twoTop: "94", twoBottom: "69" },
  { drawDate: "2025-12-06", threeTop: "193", twoTop: "93", twoBottom: "18" },
  { drawDate: "2025-12-05", threeTop: "474", twoTop: "74", twoBottom: "19" },
  { drawDate: "2025-12-04", threeTop: "631", twoTop: "31", twoBottom: "33" },
  { drawDate: "2025-12-03", threeTop: "753", twoTop: "53", twoBottom: "07" },
  { drawDate: "2025-12-02", threeTop: "066", twoTop: "66", twoBottom: "80" },
  { drawDate: "2025-12-01", threeTop: "291", twoTop: "91", twoBottom: "13" },
  { drawDate: "2025-11-30", threeTop: "225", twoTop: "25", twoBottom: "43" },
  { drawDate: "2025-11-29", threeTop: "805", twoTop: "05", twoBottom: "99" }
];

async function main() {
  if (!pool) {
    console.error("Database not configured, abort seeding.");
    return;
  }
  for (const row of rows) {
    await upsertLotteryResult({
      lotteryCode: "viet-special",
      drawDate: row.drawDate,
      threeDigits: row.threeTop,
      twoDigits: row.twoBottom,
      extra: {
        twoTop: row.twoTop,
        twoBottom: row.twoBottom
      }
    });
    console.log(`Upserted viet-special ${row.drawDate}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool?.end();
});
