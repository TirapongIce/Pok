import { useMemo, useState } from "react";

export default function DepositPanel({ onSubmit, transactions = [], depositNotice = "", depositLineUrl = "" }) {
  const [form, setForm] = useState({ amount: "", note: "" });
  const [slipFile, setSlipFile] = useState(null);
  const [slipName, setSlipName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const depositHistory = useMemo(() => {
    return (transactions || [])
      .filter((txn) => (txn.txn_type || txn.txnType) === "deposit")
      .sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
      .slice(0, 10);
  }, [transactions]);

  function resetForm() {
    setForm({ amount: "", note: "" });
    setSlipFile(null);
    setSlipName("");
    setError("");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSlipFile(file);
    setSlipName(file ? file.name : "");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.amount) {
      setError("กรุณาระบุจำนวนเงินที่ต้องการฝาก");
      return;
    }
    if (!slipFile) {
      setError("กรุณาแนบไฟล์สลิปการโอนเงิน");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit?.(Number(form.amount), slipFile, form.note);
      resetForm();
      if (event.target.reset) {
        event.target.reset();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel deposit-notice-only">
      <div className="deposit-notice-box">
        <h2>ฝากเครดิต</h2>
        <p className="deposit-message">{depositNotice || "ฝากเครดิต กรุณาติดต่อ Admin"}</p>
        {depositLineUrl ? (
          <a className="line-btn" href={depositLineUrl} target="_blank" rel="noreferrer">
            📱 ติดต่อผ่าน LINE
          </a>
        ) : (
          <button className="line-btn" type="button" disabled>
            📱 ติดต่อผ่าน LINE
          </button>
        )}
      </div>
    </div>
  );
}
