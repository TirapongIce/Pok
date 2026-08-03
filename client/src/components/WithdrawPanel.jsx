import { useMemo, useState } from "react";

export default function WithdrawPanel({ onSubmit, profile, summary }) {
  const [form, setForm] = useState({ amount: "", note: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [insufficientOpen, setInsufficientOpen] = useState(false);

  const bankName = profile?.bankName || "ธนาคาร ";
  const bankAccount = profile?.bankAccount || "หมายเลขท้าย **";
  const pending = Number(profile?.creditUsed ?? 0);
  const available = useMemo(() => {
    if (typeof profile?.creditAvailable === "number") {
      return Math.max(0, Number(profile.creditAvailable));
    }
    const limit = Number(profile?.creditLimit ?? 0);
    return Math.max(0, limit - pending);
  }, [profile, pending]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.amount) {
      setError("กรุณาระบุจำนวนเงินที่ต้องการถอน");
      return;
    }
    if (Number(form.amount) > available) {
      setInsufficientOpen(true);
      return;
    }
    setError("");
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      if (Number(form.amount) > available) {
        setInsufficientOpen(true);
        return;
      }
      await onSubmit?.(Number(form.amount), form.note);
      setForm({ amount: "", note: "" });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="withdraw-shell">
      <div className="withdraw-panel">
        <div className="withdraw-bank-card">
          <div className="withdraw-bank-icon">{bankName.slice(0, 1)}</div>
          <div>
            <strong>{bankName}</strong>
            <small>{bankAccount}</small>
          </div>
        </div>
        <div className="withdraw-info-row">
          <span>ยอดเล่นค้าง</span>
          <strong>{pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className="withdraw-info-row">
          <span>ยอดเงินที่ถอนได้</span>
          <strong>{available.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        <form className="withdraw-form" onSubmit={handleSubmit}>
          <label>จำนวนเงินที่ถอน</label>
          <div className="withdraw-input">
            <input type="number" min="1" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="กรุณากรอกจำนวนเงิน" required />
          </div>
         
          {error && <p className="text-error withdraw-error">{error}</p>}
          <button className="withdraw-btn" type="submit" disabled={submitting}>
            ถอนเงิน
          </button>
        </form>
      </div>
      {confirmOpen && (
        <div className="modal-overlay">
          <div className="modal purchase-result-modal">
            <h3>ยืนยันคำขอถอน</h3>
            <p>ต้องการถอน {Number(form.amount).toLocaleString()} บาทหรือไม่?</p>
            <div className="modal-actions">
              <button className="primary-btn" type="button" onClick={handleConfirm} disabled={submitting}>
                ยืนยัน
              </button>
              <button type="button" onClick={() => setConfirmOpen(false)}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
      {insufficientOpen && (
        <div className="modal-overlay">
          <div className="modal purchase-result-modal">
            <h3>เครดิตไม่เพียงพอ</h3>
            <p>ยอดที่ขอถอน {Number(form.amount).toLocaleString()}  มากกว่ายอดที่ถอนได้ {available.toLocaleString()} </p>
            <div className="modal-actions">
              <button className="primary-btn" type="button" onClick={() => setInsufficientOpen(false)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
