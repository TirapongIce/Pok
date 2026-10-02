// Read-only report: compares recorded line payouts to current stored results and
// the rate captured on each line. It NEVER edits balances or historical results.
import 'dotenv/config';
import { pool } from '../src/db.js';
import { resolveWinningNumbers, canSettleBetType, isWinningBet } from '../src/services/lottoRules.js';
const csv = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
async function main() {
  if (!pool) throw new Error('Database is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query(`SELECT t.id AS ticket_id, pl.id AS line_id, t.user_id,
      t.lottery_code, t.draw_date, t.status AS ticket_status, pl.status, pl.paid,
      pl.bet_type, pl.numbers, pl.amount, pl.payout_rate, pl.payout_amount,
      r.first_prize, r.front_three_a, r.front_three_b, r.back_three_a, r.back_three_b,
      r.two_digits, r.three_digits, r.extra
      FROM tickets t LEFT JOIN purchase_logs pl ON pl.ticket_id=t.id
      LEFT JOIN lottery_results r ON r.lottery_code=t.lottery_code AND r.draw_date=t.draw_date
      WHERE t.status <> 'pending' OR pl.paid=TRUE ORDER BY t.id,pl.id`);
    console.log(['ticket_id','line_id','user_id','lottery','draw_date','status','number','bet_type','recorded_payout','expected_from_stored_result','difference','review_reason'].join(','));
    for (const row of rows) {
      let expected = null, difference = null, reason = '';
      const winning = resolveWinningNumbers(row.lottery_code, { firstPrize: row.first_prize, threeDigits: row.three_digits, twoDigits: row.two_digits, frontThree: [row.front_three_a, row.front_three_b], backThree: [row.back_three_a, row.back_three_b], extra: row.extra });
      if (!row.line_id) reason = 'legacy_ticket_without_lines';
      else if (row.ticket_status === 'cancelled') { expected = 0; reason = 'cancelled_ticket'; }
      else if (!canSettleBetType(row.bet_type, winning)) reason = 'missing_result';
      else if (row.payout_rate == null) reason = 'missing_captured_rate';
      else expected = isWinningBet(row.bet_type, row.numbers, winning) ? Math.round(Number(row.amount) * Number(row.payout_rate) * 100) / 100 : 0;
      if (row.payout_amount == null) reason = reason || 'missing_recorded_payout';
      else if (expected !== null) {
        difference = Math.round((Number(row.payout_amount) - expected) * 100) / 100;
        if (difference) reason = 'difference_or_manual_override';
      }
      if (reason) console.log([row.ticket_id,row.line_id,row.user_id,row.lottery_code,row.draw_date,row.status,row.numbers,row.bet_type,row.payout_amount,expected,difference,reason].map(csv).join(','));
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool?.end());
