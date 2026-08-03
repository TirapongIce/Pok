import { useEffect, useState } from "react";

export default function NewsPanel({ announcements = [], editable = false }) {
  const [items, setItems] = useState(announcements ?? []);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    level: "info",
    expiresAt: ""
  });

  useEffect(() => {
    setItems(announcements ?? []);
  }, [announcements]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!draft.title || !draft.body) return;
    setItems((prev) => [
      {
        id: `draft-${Date.now()}`,
        title: draft.title,
        body: draft.body,
        level: draft.level,
        expiresAt: draft.expiresAt || null
      },
      ...prev
    ]);
    setDraft({ title: "", body: "", level: "info", expiresAt: "" });
  }

  return (
    <div className="panel">
      <h3>ข่าว / ประชาสัมพันธ์</h3>
      <ul className="news-list">
        {items.map((item) => (
          <li key={item.id} className="news-item">
            <div className="news-head">
              <strong>{item.title}</strong>
              <span className={`badge ${item.level === "warning" ? "badge-warning" : "badge-info"}`}>
                {item.level === "warning" ? "แจ้งเตือน" : "ข่าว"}
              </span>
            </div>
            <p>{item.body}</p>
            <small>หมดอายุ: {item.expiresAt ? new Date(item.expiresAt).toLocaleString("th-TH") : "-"}</small>
            {editable && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                style={{ marginTop: 6 }}
              >
                ลบ
              </button>
            )}
          </li>
        ))}
        {!items.length && <li>ยังไม่มีข่าว</li>}
      </ul>
      {editable && (
        <form className="two-column" onSubmit={handleSubmit}>
          <div className="field">
            <label>หัวข้อ</label>
            <input name="title" value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} required />
          </div>
          <div className="field">
            <label>ประเภท</label>
            <select name="level" value={draft.level} onChange={(e) => setDraft((prev) => ({ ...prev, level: e.target.value }))}>
              <option value="info">ข่าว</option>
              <option value="warning">แจ้งเตือน</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>รายละเอียด</label>
            <textarea name="body" rows={3} value={draft.body} onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))} required />
          </div>
          <div className="field">
            <label>วันหมดอายุ</label>
            <input
              type="datetime-local"
              name="expiresAt"
              value={draft.expiresAt}
              onChange={(e) => setDraft((prev) => ({ ...prev, expiresAt: e.target.value }))}
            />
          </div>
          <button className="primary-btn" type="submit">
            เพิ่มข่าว
          </button>
          <button
            className="secondary-btn ghost"
            type="button"
            onClick={() => {
              setDraft({ title: "", body: "", level: "info", expiresAt: "" });
            }}
          >
            ล้างฟอร์ม
          </button>
        </form>
      )}
    </div>
  );
}
