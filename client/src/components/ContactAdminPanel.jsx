import { useState } from "react";

export default function ContactAdminPanel({ settings, messages = [], loading = false, error = "", onSend }) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend?.(draft.trim());
    setDraft("");
  }

  return (
    <div className="panel contact-panel">
      <h3>ติดต่อแอดมิน</h3>
      <p>สนทนากับทีมงานผ่านระบบแชท หรือใช้ช่องทางอื่นที่แสดงไว้</p>
      <div className="contact-card">
        <strong>ช่องทางหลัก</strong>
        <p>LINE: @huay-support</p>
        <p>โทร: 02-123-4567</p>
      </div>
      <div className="contact-card">
        <strong>ประกาศล่าสุด</strong>
        <p>{settings?.noticeMessage ?? "ยังไม่มีข้อความประกาศ"}</p>
      </div>
      <div className="chat-window">
        {loading && <p>กำลังโหลดข้อความ...</p>}
        {error && <p className="text-error">{error}</p>}
        {!loading && !messages.length && <p>ยังไม่มีประวัติการสนทนา</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.sender === "admin" ? "admin" : "user"}`}>
            <p>{msg.message}</p>
            <small>{new Date(msg.created_at ?? msg.createdAt).toLocaleString("th-TH")}</small>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea rows={3} placeholder="พิมพ์ข้อความถึงแอดมิน" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="primary-btn" type="submit" disabled={!draft.trim() || loading}>
          ส่งข้อความ
        </button>
      </form>
    </div>
  );
}
