export default function CreditInfoPanel({ profile, summary, daily, ledger, transactions = [] }) {
  const availableCredit = Number(
    profile?.creditAvailable ??
      summary?.creditAvailable ??
      Math.max(Number(profile?.creditLimit ?? summary?.creditLimit ?? 0) - Number(profile?.creditUsed ?? summary?.creditUsed ?? 0), 0)
  );
  return (
    <div className="panel">
      <h3>ข้อมูลเครดิตของคุณ</h3>
      <div className="credit-info-grid">
        <div className="credit-card">
          <small>เครดิตคงเหลือ</small>
          <strong>{availableCredit.toLocaleString()}</strong>
        </div>
        <div className="credit-card">
          <small>ยอดแทงวันนี้</small>
          <strong>{Number(daily?.totalAmount ?? 0).toLocaleString()}</strong>
        </div>
      </div>
      <h4>ประวัติโดยย่อ</h4>
      <table className="table">
        <thead>
          <tr>
            <th>โพย</th>
            <th>หวย</th>
            <th>ยอดแทง</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {(ledger ?? []).slice(0, 5).map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.lotteryId}</td>
              <td>{Number(item.debit ?? 0).toLocaleString()}</td>
              <td>{item.credit > 0 ? "ถูกรางวัล" : "รอดำเนินการ"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>ประวัติฝาก-ถอน</h4>
      <table className="table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ประเภท</th>
            <th>สถานะ</th>
            <th>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {(transactions ?? []).map((txn) => (
            <tr key={txn.id ?? txn.created_at}>
              <td>{new Date(txn.created_at ?? txn.createdAt).toLocaleString("th-TH")}</td>
              <td>{txn.txn_type === "withdraw" ? "ถอน" : "ฝาก"}</td>
              <td>{txn.status ?? "pending"}</td>
              <td>{Number(txn.amount ?? 0).toLocaleString()}</td>
            </tr>
          ))}
          {!transactions?.length && (
            <tr>
              <td colSpan={4}>ยังไม่มีคำขอฝาก-ถอน</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
