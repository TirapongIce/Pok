import { useEffect, useMemo, useState } from "react";
import { payoutOptionMap } from "../constants/purchaseOptions";

// โอกาสถูกต่อรายการ (ต้องตรงกับ server/src/services/lottoRules.js)
const WIN_PROBABILITY = {
  "three-top": 1 / 1000,
  "three-tod": 6 / 1000,
  "three-bottom": 2 / 1000,
  "three-front": 2 / 1000,
  "three-front-tod": 12 / 1000,
  "two-top": 1 / 100,
  "two-bottom": 1 / 100,
  "two-tod": 2 / 100,
  "run-top": 1 - 0.9 ** 3,
  "run-bottom": 1 - 0.9 ** 2
};

const rtpOf = (betType, rate) => {
  const p = WIN_PROBABILITY[betType];
  const r = Number(rate);
  return p == null || !Number.isFinite(r) ? null : r * p;
};

export default function PayoutRatesPanel({ lotteries = [], onFetchPayoutRates, onSavePayoutRates }) {
  const [selected, setSelected] = useState(lotteries?.[0]?.id ?? "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!selected && lotteries?.[0]?.id) setSelected(lotteries[0].id);
  }, [lotteries, selected]);

  useEffect(() => {
    if (!selected || !onFetchPayoutRates) return;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    onFetchPayoutRates(selected)
      .then((data) => {
        if (cancelled) return;
        setRows((Array.isArray(data) ? data : []).map((row) => ({ betType: row.betType, rate: String(row.rate) })));
      })
      .catch((err) => !cancelled && setMessage({ type: "error", text: err.message || "โหลดเรทไม่สำเร็จ" }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, onFetchPayoutRates]);

  const overLimit = useMemo(() => rows.filter((row) => (rtpOf(row.betType, row.rate) ?? 0) > 1), [rows]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!onSavePayoutRates) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSavePayoutRates(
        selected,
        rows.map((row) => ({ betType: row.betType, rate: Number(row.rate) }))
      );
      setMessage({ type: "success", text: "บันทึกเรทจ่ายสำเร็จ" });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "บันทึกเรทไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <h3>ตั้งค่าเรทจ่าย</h3>
      <p className="text-muted">
        RTP = เงินที่คืนผู้เล่นต่อยอดแทง 100 บาท (เช่น 90% = เจ้ามือได้ 10%). ระบบไม่อนุญาตเรทที่ RTP เกิน 100%
      </p>
      <div className="field">
        <label>เลือกหวย</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {(lotteries || []).map((lottery) => (
            <option key={lottery.id} value={lottery.id}>
              {lottery.name || lottery.id}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <form onSubmit={handleSave}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>เรทจ่าย (บาทละ)</th>
                <th>RTP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rtp = rtpOf(row.betType, row.rate);
                return (
                  <tr key={row.betType}>
                    <td>{payoutOptionMap[row.betType]?.label ?? row.betType}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.rate}
                        onChange={(e) =>
                          setRows((prev) => prev.map((item, i) => (i === idx ? { ...item, rate: e.target.value } : item)))
                        }
                      />
                    </td>
                    <td style={{ color: rtp > 1 ? "var(--danger, #c22)" : undefined }}>
                      {rtp == null ? "-" : `${(rtp * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {overLimit.length > 0 && (
            <p style={{ color: "var(--danger, #c22)" }}>
              เรทต่อไปนี้ทำให้เจ้ามือขาดทุน: {overLimit.map((row) => payoutOptionMap[row.betType]?.label ?? row.betType).join(", ")}
            </p>
          )}
          <button className="primary-btn" type="submit" disabled={saving || !rows.length || overLimit.length > 0}>
            {saving ? "กำลังบันทึก..." : "บันทึกเรทจ่าย"}
          </button>
          {message && (
            <p style={{ color: message.type === "error" ? "var(--danger, #c22)" : "var(--success, #2a7)" }}>{message.text}</p>
          )}
        </form>
      )}
    </div>
  );
}
