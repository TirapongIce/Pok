// Credits in this application are test credits, never a payment integration.
function problem(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function validAmount(value) {
  return Number.isFinite(value) && value > 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
}
export async function requestTestWithdrawal(pool, userId, amount, note) {
  if (!validAmount(amount)) throw problem('จำนวนเครดิตไม่ถูกต้อง');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`UPDATE users SET credit_limit=credit_limit-$2
      WHERE id=$1 AND credit_limit-credit_used >= $2 RETURNING id`, [userId, amount]);
    if (!rows.length) throw problem('เครดิตไม่เพียงพอ');
    const result = await client.query(`INSERT INTO transactions(user_id,txn_type,status,amount,note)
      VALUES ($1,'withdraw','pending',$2,$3) RETURNING *`, [userId, amount, note]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
export async function decideTestTransaction(pool, id, status) {
  if (!['approved', 'rejected'].includes(status)) throw problem('สถานะไม่ถูกต้อง');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT *, user_id AS "userId", txn_type AS "txnType" FROM transactions WHERE id=$1 FOR UPDATE', [id]);
    const txn = rows[0];
    if (!txn) throw problem('ไม่พบธุรกรรม', 404);
    if (txn.status !== 'pending') throw problem('ธุรกรรมนี้ดำเนินการแล้ว', 409);
    if (!['deposit', 'withdraw'].includes(txn.txnType)) throw problem('ประเภทไม่ถูกต้อง');
    if ((status === 'approved' && txn.txnType === 'deposit') || (status === 'rejected' && txn.txnType === 'withdraw')) {
      await client.query('UPDATE users SET credit_limit=credit_limit+$2 WHERE id=$1', [txn.userId, txn.amount]);
    }
    await client.query('UPDATE transactions SET status=$2 WHERE id=$1', [id, status]);
    await client.query('COMMIT');
    return txn;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
