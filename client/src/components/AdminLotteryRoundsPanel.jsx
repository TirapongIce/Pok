import { useEffect, useState } from "react";

function getSessionToken() {
  try {
    const raw = window.localStorage.getItem("huaySession");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.token ?? null;
  } catch {
    return null;
  }
}

export default function AdminLotteryRoundsPanel({ lotteries = [], onSaved }) {
  const [selected, setSelected] = useState(lotteries?.[0]?.id ?? "");
  const [text, setText] = useState("[]");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(lotteries?.[0]?.id ?? "");
  }, [lotteries]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError("");
    const token = getSessionToken();
    fetch(`/api/admin/lottery-rounds/${encodeURIComponent(selected)}`, {
      headers: token ? { "x-session-token": token } : {}
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.rounds) {
          try {
            setText(JSON.stringify(data.rounds, null, 2));
          } catch {
            setText(String(data.rounds));
          }
        } else {
          setText("[]");
        }
      })
      .catch((err) => {
        console.error("load rounds failed:", err);
        setError("ไม่สามารถโหลดการตั้งค่าวงรอบได้");
        setText("[]");
      })
      .finally(() => setLoading(false));
  }, [selected]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("rounds must be an array");
    } catch (err) {
      setError("รูปแบบ JSON ไม่ถูกต้อง: ต้องเป็นอาเรย์ของวัตถุ {day,name}");
      setSaving(false);
      return;
    }
    const token = getSessionToken();
    try {
      const resp = await fetch(`/api/admin/lottery-rounds/${encodeURIComponent(selected)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-session-token": token } : {})
        },
        body: JSON.stringify({ rounds: parsed })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || "save failed");
      }
      alert("บันทึกการตั้งค่าวงรอบเรียบร้อย");
      onSaved?.();
    } catch (err) {
      console.error("save rounds failed:", err);
      setError("ไม่สามารถบันทึกได้: " + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  function applySample() {
    setText(JSON.stringify([{ date: "2027-01-16", skip: true }, { date: "2027-01-17", close: "14:30" }], null, 2));
  }

  return (
    <div className="panel">
      <h3>ตั้งค่าวงรอบหวย (Lottery Rounds)</h3>
      <div className="field">
        <label>เลือกหวย</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {(lotteries || []).map((l) => (
            <option key={l.id || l.code} value={l.id || l.code}>
              {l.name || l.id || l.code}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSave}>
        <div className="field">
          <label>rounds (JSON array)</label>
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          <small>
            ใช้ปรับงวดที่ไม่ตรงตารางปกติ (เช่น เลื่อน 16 ม.ค. เป็น 17 ม.ค.): เพิ่มงวด {`{ "date": "2027-01-17", "close": "14:30" }`} · ยกเลิกงวดปกติ {`{ "date": "2027-01-16", "skip": true }`}
          </small>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary-btn" type="submit" disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
          <button type="button" className="secondary-btn" onClick={applySample}>
            ใส่ตัวอย่าง
          </button>
        </div>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: "var(--danger, #c22)" }}>{error}</p>}
      </form>
    </div>
  );
}
