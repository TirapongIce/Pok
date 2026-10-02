// แก้ draw_date ของโพยที่ยังรอผล ซึ่งโค้ดเดิมบันทึกเลื่อนไป 1 วัน (เมื่อ server ตั้ง TZ เป็นเวลาไทย)
//   หวยรัฐบาล/ออมสิน/ธกส : วันที่ 15 หรือวันสุดท้ายของเดือน -> +1 วัน (16 / 1)
//   หวยลาว            : อาทิตย์/อังคาร/พฤหัส -> +1 วัน (จันทร์/พุธ/ศุกร์)
// ค่าเริ่มต้นเป็น dry-run; ใส่ --apply เพื่อแก้จริง
//   node scripts/fixDrawDates.js            # ดูรายการที่จะถูกแก้
//   node scripts/fixDrawDates.js --apply    # แก้จริง (ในธุรกรรมเดียว)
import "dotenv/config";
import { pool } from "../src/db.js";

const APPLY = process.argv.includes("--apply");

const CANDIDATES_SQL = `
  SELECT id, lottery_code, draw_date, (draw_date + 1) AS fixed_date
    FROM tickets
   WHERE status = 'pending'
     AND draw_date IS NOT NULL
     AND (
       (lottery_code IN ('th-lottery', 'gsb-lottery', 'baac-lottery')
         AND EXTRACT(DAY FROM draw_date + 1) IN (1, 16)
         AND EXTRACT(DAY FROM draw_date) NOT IN (1, 16))
       OR
       (lottery_code LIKE 'lao%' AND EXTRACT(DOW FROM draw_date) IN (0, 2, 4))
     )
   ORDER BY id`;

async function main() {
  if (!pool) {
    console.error("Database is not configured");
    process.exit(1);
  }
  const { rows } = await pool.query(CANDIDATES_SQL);
  if (!rows.length) {
    console.log("ไม่พบโพยที่ต้องแก้ draw_date");
    return;
  }
  const summary = {};
  for (const row of rows) {
    const key = `${row.lottery_code}: ${row.draw_date} -> ${row.fixed_date}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  console.table(summary);
  if (!APPLY) {
    console.log(`dry-run: พบ ${rows.length} ใบ (รันซ้ำด้วย --apply เพื่อแก้จริง)`);
    return;
  }
  const ids = rows.map((row) => row.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE tickets SET draw_date = draw_date + 1 WHERE id = ANY($1::bigint[])", [ids]);
    await client.query("UPDATE purchase_logs SET draw_date = draw_date + 1 WHERE ticket_id = ANY($1::bigint[])", [ids]);
    await client.query("COMMIT");
    console.log(`แก้ draw_date แล้ว ${ids.length} ใบ`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
