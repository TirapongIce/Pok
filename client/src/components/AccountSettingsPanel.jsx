import { useState } from "react";

export default function AccountSettingsPanel({
  profile,
  onSaveProfile,
  onChangePassword,
}) {
  const isProfileReadOnly = true;
  const [form, setForm] = useState({
    fullName: profile?.account?.full_name ?? "",
    phone: profile?.account?.phone ?? "",
    bankName: profile?.account?.bank_name ?? "",
    bankAccount: profile?.account?.bank_account ?? "",
    bsb: profile?.account?.bsb ?? "",
    registrationNo: profile?.account?.registration_no ?? "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    password: "",
    confirm: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave(event) {
    if (event && typeof event.preventDefault === "function")
      event.preventDefault();
    if (!passwordForm.password) {
      alert("กรุณากรอกรหัสผ่านใหม่");
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      alert("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (passwordForm.password.length < 8) {
      alert("รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
      return;
    }
    try {
      await onChangePassword?.(passwordForm.password, passwordForm.currentPassword);
      setPasswordForm({ currentPassword: "", password: "", confirm: "" });
      alert("เปลี่ยนรหัสผ่านเรียบร้อย");
    } catch (err) {
      console.error(err);
      alert(err?.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
    }
  }

  return (
    <div className="panel account-panel">
      <h3 className="panel-title">ตั้งค่าบัญชี</h3>

      <form className="account-form" onSubmit={handleSave}>
        {/* grid 2 col / auto 1 col บนมือถือ จะจัดด้วย CSS */}
        <div className="form-grid">
          <div className="field">
            <label>ชื่อ-นามสกุล</label>
            <input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              disabled={isProfileReadOnly}
              readOnly={isProfileReadOnly}
            />
          </div>

          <div className="field">
            <label>เบอร์ติดต่อ</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="080-000-0000"
              disabled={isProfileReadOnly}
              readOnly={isProfileReadOnly}
            />
          </div>

          <div className="field">
            <label>ธนาคาร</label>
            <input
              name="bankName"
              value={form.bankName}
              onChange={handleChange}
              placeholder="HSBC"
              disabled={isProfileReadOnly}
              readOnly={isProfileReadOnly}
            />
          </div>

          <div className="field">
            <label>เลขบัญชี</label>
            <input
              name="bankAccount"
              value={form.bankAccount}
              onChange={handleChange}
              placeholder="61727-9090"
              disabled={isProfileReadOnly}
              readOnly={isProfileReadOnly}
            />
          </div>

          <div className="field">
            <label>BSB</label>
            <input
              name="bsb"
              value={form.bsb}
              onChange={handleChange}
              placeholder="342252"
              disabled={isProfileReadOnly}
              readOnly={isProfileReadOnly}
            />
          </div>
        </div>

        {/* password section ใช้ grid 2 col เหมือนกัน */}
        <div className="form-grid form-password">
          <div className="field">
            <label htmlFor="current-password">รหัสผ่านปัจจุบัน</label>
            <input id="current-password" type="password" name="currentPassword" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={handlePasswordChange} />
          </div>
          <div className="field">
            <label>รหัสผ่านใหม่</label>
            <input
              type="password"
              name="password"
              value={passwordForm.password}
              onChange={handlePasswordChange}
            />
          </div>

          <div className="field">
            <label>ยืนยันรหัสผ่าน</label>
            <input
              type="password"
              name="confirm"
              value={passwordForm.confirm}
              onChange={handlePasswordChange}
            />
          </div>
        </div>

        {/* ปุ่มชิดขวา */}
        <div className="account-save-actions">
          <button className="btn btn-primary account-save-btn" type="submit">
            บันทึกรหัสผ่าน
          </button>
        </div>
      </form>
    </div>
  );
}
