> คู่มือนี้เป็นเอกสารเดิม โปรดใช้ [README ล่าสุด](../README.md) สำหรับการตั้งค่ารหัสผ่านและชุดทดสอบ

# คู่มือการติดตั้งและรันระบบหวย

## 1. ข้อกำหนดระบบ
- Node.js 24 ขึ้นไป
- npm 9 ขึ้นไป
- Docker Desktop หรือ PostgreSQL local เฉพาะกรณีต้องการใช้ฐานข้อมูลจริง
- macOS, Linux หรือ Windows

## 2. แตกไฟล์ zip
แตกไฟล์ส่งมอบแล้วเข้าโฟลเดอร์โปรเจกต์:

```bash
cd /path/to/lottery-system
```

## 3. ติดตั้ง dependency
ติดตั้ง dependency ของ frontend และ backend:

```bash
npm install --prefix client
npm install --prefix server
```

หมายเหตุ: แพ็กเกจส่งมอบไม่รวม `node_modules/` เพื่อให้ไฟล์ zip มีขนาดเหมาะสมและติดตั้ง dependency ใหม่ตามเครื่องปลายทาง

## 4. รันแบบ demo mode
โหมดนี้ไม่ต้องใช้ฐานข้อมูล ระบบจะใช้ข้อมูลจำลองในหน่วยความจำ

```bash
npm run dev
```

คำสั่งนี้จะเปิด backend และ frontend พร้อมกัน:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4001`

ถ้าต้องการรันแยก terminal:

```bash
cd /path/to/lottery-system/server
npm run dev
```

```bash
cd /path/to/lottery-system/client
npm run dev
```

## 5. บัญชีทดสอบ
- Super admin: `superadmin` / `Sup3rDemo!`
- Agent demo: `agentdemo` / `AgentDemo123!`

## 6. รันด้วย PostgreSQL local
ใช้วิธีนี้เมื่อต้องการให้ข้อมูลบันทึกลงฐานข้อมูลจริง

เริ่ม PostgreSQL ด้วย Docker:

```bash
docker compose up -d postgres
```

สร้างไฟล์ env จากตัวอย่าง:

```bash
cp server/.env.example server/.env
```

ค่าเริ่มต้นใน `server/.env.example` จะตรงกับ `docker-compose.yml`:

```env
PORT=4001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=huay_aud_db
DB_USER=huay_aud
DB_PASSWORD=YOUR_LOCAL_TEST_PASSWORD
```

apply schema:

```bash
chmod +x server/scripts/run_schema.sh
server/scripts/run_schema.sh
```

จากนั้นรันระบบ:

```bash
npm run dev
```

ตรวจสอบ DB:

```bash
curl http://localhost:4001/api/health/db
```

ควรได้ผลลัพธ์ลักษณะนี้:

```json
{"status":"ok"}
```

## 7. Build frontend
เมื่อต้องการ build frontend:

```bash
cd /path/to/lottery-system/client
npm run build
```

ไฟล์ build จะอยู่ที่:

```text
client/dist/
```

## 8. แนวทางนำขึ้น production
Backend:

```bash
cd /path/to/lottery-system/server
npm install
npm start
```

Frontend:

```bash
cd /path/to/lottery-system/client
npm install
npm run build
```

ให้นำ `client/dist/` ไปวางบน static web server และตั้ง reverse proxy ให้ path `/api` ส่งต่อไปยัง backend เช่น `http://127.0.0.1:4001`

## 9. Environment ที่สำคัญ
- `PORT` - port backend ค่าเริ่มต้น `4001`
- `DB_HOST` - host PostgreSQL
- `DB_PORT` - port PostgreSQL ค่าเริ่มต้น `5432`
- `DB_NAME` - ชื่อ database
- `DB_USER` - username database
- `DB_PASSWORD` - password database
- `DB_SSL` - ตั้งเป็น `true` หากต้องการใช้ SSL
- `DB_SCHEMA` - schema database ค่าเริ่มต้น `lotto_demo`
- `SUPERADMIN_USERNAME` - username super admin ค่าเริ่มต้น `superadmin`
- `SUPERADMIN_PASSWORD` - password super admin ค่าเริ่มต้น `Sup3rDemo!`
- `SUPERADMIN_CREDIT_LIMIT` - credit limit เริ่มต้นของ super admin
- `DEMO_AGENT_PASSWORD` - password ของ agent demo ค่าเริ่มต้น `AgentDemo123!`

## 10. ปัญหาที่พบบ่อย
- ถ้า port `5173` หรือ `4001` ถูกใช้ ให้ปิด process เดิมก่อน หรือแก้ port ใน config
- ถ้า backend แจ้งว่า database configuration incomplete ระบบยังรันได้ใน demo mode
- ถ้าใช้ frontend production build ต้องตั้ง proxy `/api` ไป backend เพราะ Vite proxy ใช้เฉพาะตอน dev
- ก่อนใช้งานจริงควรเปลี่ยน default password และเก็บ `.env` แยกจาก source code
