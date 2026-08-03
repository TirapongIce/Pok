# เอกสารส่งมอบระบบหวย

วันที่จัดทำ: 19 กรกฎาคม 2026

## 1. ภาพรวมระบบ
ระบบหวยเป็นระบบเว็บหวยไทยและต่างประเทศสำหรับสาธิต flow การใช้งานหลัก ประกอบด้วยหน้าผู้ใช้, ระบบซื้อโพย, ประวัติโพย, ฝาก/ถอน, แจ้งเตือน, แชต, และระบบหลังบ้านสำหรับ Admin/Agent

ระบบถูกจัดเป็น monorepo แยกส่วนดังนี้:

- `client/` - Frontend React 18 + Vite
- `server/` - Backend Node.js + Express API
- `server/schema_postgres.sql` - schema สำหรับ PostgreSQL
- `docker-compose.yml` - PostgreSQL สำหรับทดสอบ local
- `delivery/` - เอกสารส่งมอบและคู่มือติดตั้ง

## 2. เทคโนโลยีที่ใช้
- Frontend: React 18, Vite, Ant Design
- Backend: Node.js, Express
- Database: PostgreSQL ผ่าน `pg` หรือ demo data fallback เมื่อไม่ได้ตั้งค่า DB
- Build tool: npm

## 3. ฟีเจอร์หลักที่ส่งมอบ
- เข้าสู่ระบบด้วยบัญชีตัวอย่าง และ hash password ด้วย SHA-256 ก่อนส่ง API
- รายการหวยไทย/ลาว และหวยต่างประเทศในโหมดสาธิต
- ซื้อโพย, คำนวณยอด, บันทึกประวัติ, และยกเลิกโพยตามช่วงเวลาที่กำหนด
- ข้อมูลเครดิตสมาชิก, เดินบัญชีเครดิต, ฝากเงิน, ถอนเงิน
- โปรโมชัน, popup/ประกาศ, notification, live status และ chat
- ระบบหลังบ้านสำหรับจัดการสมาชิก, เครดิต, transaction, รายงานโพย, สรุปรายวัน, รายงานรายได้
- ตั้งค่าเรทจ่าย, เลขอั้น/เลขปิดรับ, รอบหวย และประกาศผลรางวัล
- API ประเมินผลโพยจากผลรางวัลล่าสุด
- รองรับ PostgreSQL จริง และ fallback demo data สำหรับเปิดทดสอบทันที

## 4. บัญชีทดสอบ
- Super admin: `superadmin` / `Sup3rDemo!`
- Agent demo: `agentdemo` / `AgentDemo123!`

ควรเปลี่ยนรหัสผ่านเริ่มต้นก่อนนำไปใช้งานจริง

## 5. URL และพอร์ตเริ่มต้น
- Frontend dev server: `http://localhost:5173`
- Backend API: `http://localhost:4001`
- API path: `/api`
- DB health check: `http://localhost:4001/api/health/db`

## 6. โหมดฐานข้อมูล
ระบบทำงานได้ 2 รูปแบบ:

- Demo mode: ไม่ต้องตั้งค่า database ถ้าไม่มี `server/.env` หรือ env ไม่ครบ ระบบจะใช้ข้อมูลจำลองในหน่วยความจำ
- PostgreSQL mode: ตั้งค่า `DB_HOST`, `DB_USER`, `DB_NAME` และ env ที่เกี่ยวข้องใน `server/.env`

เมื่อเชื่อมต่อ PostgreSQL สำเร็จ backend จะ seed ข้อมูลเริ่มต้น เช่นบัญชี admin, agent, lottery, payout rate และผลรางวัลตัวอย่างโดยอัตโนมัติ

## 7. การตรวจสอบล่าสุด
- Frontend build ผ่านด้วย `npm run build --prefix client`
- Backend syntax check ผ่านด้วย `node --check server/src/index.js`
- ตรวจ syntax ไฟล์ runtime หลัก `server/src/db.js` และ `dev.js` แล้ว

หมายเหตุ: Vite มี warning เรื่อง chunk JavaScript ใหญ่กว่า 500 kB แต่ build สำเร็จ สามารถปรับ code splitting เพิ่มเติมได้ในอนาคต

## 8. รายการไฟล์สำคัญในแพ็กเกจ
- `README.md` - คำอธิบายโปรเจกต์แบบย่อ
- `package.json` - script รวมสำหรับรัน client/server พร้อมกัน
- `dev.js` - script เปิด frontend และ backend พร้อมกัน
- `client/package.json` - dependency และ script ของ frontend
- `client/dist/` - build frontend ล่าสุด
- `server/package.json` - dependency และ script ของ backend
- `server/.env.example` - ตัวอย่าง env สำหรับ backend
- `server/schema_postgres.sql` - schema PostgreSQL
- `server/scripts/run_schema.sh` - script apply schema
- `docker-compose.yml` - PostgreSQL local container
- `delivery/INSTALLATION_TH.md` - คู่มือติดตั้งและรันระบบ
- `delivery/ACCEPTANCE_CHECKLIST_TH.md` - checklist สำหรับตรวจรับงาน
- `delivery/pdf/` - เอกสารส่งมอบฉบับ PDF ทั้งไฟล์รวมและไฟล์แยก

## 9. หมายเหตุการส่งมอบ
- ไฟล์ `node_modules/` ไม่ถูกใส่ใน zip ให้ติดตั้งใหม่ด้วย `npm install`
- ไฟล์ `server/.env` จริงไม่ควรส่งต่อเพราะอาจมีข้อมูลลับ ให้ใช้ `server/.env.example` เป็นแม่แบบ
- หากนำขึ้น production ให้ตั้งค่า reverse proxy ให้ frontend เรียก `/api` ไปยัง backend และเปลี่ยนรหัสผ่านเริ่มต้นทั้งหมด
