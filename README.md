## ระบบหวยไทย & ต่างประเทศ

โครงการสาธิตระบบเว็บหวยตาม requirement: Front-End React, Back-End Node.js (Express) พร้อมข้อมูลจำลองเพื่อทดสอบ flow สำคัญ เช่น เข้าสู่ระบบ, รายการหวย, แทงโพย, ระบบหลังบ้าน (สมาชิก, เครดิต, รายงาน, ฝาก/ถอน, ตั้งค่าหวย)

### โครงสร้าง

```
lottery-system/
├─ server/    # Node.js Express mock API
└─ client/    # React + Vite UI
```

### การเริ่มใช้งาน

1. ติดตั้ง dependency (ต้องใช้ Node 18+)
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. รัน API
   ```bash
   cd server
   npm run dev
   # API จะอยู่ที่ http://localhost:4001
   ```
3. รัน Front-End
   ```bash
   cd client
   npm run dev
   # UI จะอยู่ที่ http://localhost:5173 (proxy /api -> server)
   ```

> ต้องการรัน Front-End + API พร้อมกัน?
>
> ```bash
> npm install
> npm run dev
> ```
>
> คำสั่งนี้จะรัน `server` และ `client` พร้อมกันในเทอร์มินัลเดียว (หยุดทั้งหมดได้ด้วย `Ctrl+C`)

> หากยังไม่ได้ติดตั้งฐานข้อมูล สามารถใช้ mock data ที่ฝั่ง server ให้มาได้ทันที

### ฟีเจอร์ที่ครอบคลุม Requirement

- **Login + Hash Password**: หน้าล็อกอินเข้ารหัสพาสเวิร์ดด้วย `SHA-256` ก่อนส่งหาทาง API (`client/src/App.jsx`).
- **Lottery List View**: เมนู `รายการหวย` แสดงแบบการ์ด (list/grid) คล้ายภาพตัวอย่าง (`client/src/App.jsx`, `client/src/styles.css`).
- **ซื้อหวย**: หน้ากรอกโพยรองรับการกรอกเองและปุ่มเลือกตัวเลขด่วน พร้อมส่งข้อมูลไปยัง `/api/purchases`.
- **ระบบหลังบ้าน** (`BackOfficePanel`):
  - 1. จัดการสมาชิก (API `/api/admin/members`)
  - 2. รายงานเครดิต (เดินบัญชี, เครดิตระหว่างสมาชิก, เช็คเครดิต)
  - 4. รายงานโพย (`/api/admin/credit-ledger`)
  - 5. สรุปยอดรายวัน (`/api/admin/daily-summary`)
  - 6. ฝากตรงถอนตรง (ฟอร์มจำลอง)
  - 7. Pop-up ประชาสัมพันธ์ (ประกาศเปิดหน้าต่าง overlay)
  - 8 & 10. ตั้งค่าระบบ/หวย (คอมโพเนนต์ `LotterySettings` + POST `/api/admin/settings`)
  - 9. รายงานรายได้ (`/api/admin/income-report`)
  - 11. หวยที่กำลังเปิดรับแทง (Dashboard + API `/api/lotteries`)
  - 12. ประกาศผลรางวัล (placeholder + คู่มืออัปโหลด)
- **Agent/Admin sitemap**: สรุปเมนูที่หน้าหลังบ้าน.
- **Deposit/Withdraw**: ฟอร์มสลับแท็บให้สมาชิกฝาก-ถอนได้ทันที.
- **Announcements**: API `/api/admin/summary` ส่งรายการแจ้งเตือนให้แสดงในหน้า popup ตามข้อ 7.
- **Responsive Layout**: Navbar แสดงเครดิต/ประกาศ + ปุ่ม toggle เมนู, sidebar กลายเป็น drawer บนมือถือ

### การต่อยอด

- เชื่อมต่อฐานข้อมูลจริง (เช่น PostgreSQL/MongoDB) เพื่อแทน mock data
- เพิ่มระบบสิทธิ์ Agent/Admin แบบ JWT แยก role
- ทำ Job สำหรับประกาศผลหวยอัตโนมัติ + Cron ปิดรอบหวย
- ออกแบบ UI ให้รองรับรูปจริงตามไฟล์ตัวอย่าง (เพิ่ม resource asset/image)
