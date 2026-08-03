# Checklist ตรวจรับระบบหวย

วันที่จัดทำ: 19 กรกฎาคม 2026

## 1. ตรวจไฟล์ส่งมอบ
- มีโฟลเดอร์ `client/`
- มีโฟลเดอร์ `server/`
- มีไฟล์ `README.md`
- มีไฟล์ `package.json`
- มีไฟล์ `docker-compose.yml`
- มีไฟล์ `server/.env.example`
- มีไฟล์ `server/schema_postgres.sql`
- มีเอกสารในโฟลเดอร์ `delivery/`

## 2. ตรวจการติดตั้ง
- รัน `npm install --prefix client` สำเร็จ
- รัน `npm install --prefix server` สำเร็จ
- รัน `npm run dev` จาก root สำเร็จ
- เปิด `http://localhost:5173` ได้
- backend ตอบที่ `http://localhost:4001`

## 3. ตรวจการเข้าสู่ระบบ
- Login ด้วย `superadmin` / `Sup3rDemo!` ได้
- Login ด้วย `agentdemo` / `AgentDemo123!` ได้
- Logout แล้วกลับไปหน้า login ได้

## 4. ตรวจ flow ผู้ใช้
- แสดงรายการหวยได้
- เปิดหน้าซื้อหวยได้
- เพิ่มรายการโพยและส่งโพยได้
- ดูประวัติโพยได้
- ดูเครดิตผู้ใช้ได้
- เปิดหน้าแจ้งฝากเงินได้
- เปิดหน้าแจ้งถอนเงินได้
- เปิดหน้าแชต/ติดต่อ admin ได้

## 5. ตรวจ flow หลังบ้าน
- เปิด Dashboard หลังบ้านได้
- ดูรายการสมาชิกได้
- เพิ่ม/แก้ไขเครดิตสมาชิกได้
- ดูรายการฝาก/ถอนและอนุมัติ/ปฏิเสธได้
- ดูรายงานเครดิตและสรุปรายวันได้
- ดูรายงานโพยได้
- ตั้งค่าเรทจ่ายได้
- ตั้งค่าเลขอั้น/เลขปิดรับได้
- บันทึกผลรางวัลและประเมินผลโพยได้

## 6. ตรวจ PostgreSQL mode
- รัน `docker compose up -d postgres` สำเร็จ
- สร้าง `server/.env` จาก `server/.env.example` แล้วแก้ค่าตาม environment ได้
- รัน `server/scripts/run_schema.sh` สำเร็จ
- endpoint `/api/health/db` ตอบ `{"status":"ok"}`
- restart backend แล้วยังเห็นข้อมูลที่บันทึกไว้ในฐานข้อมูล

## 7. ข้อควรทำก่อน production
- เปลี่ยน password เริ่มต้นทั้งหมด
- ตั้งค่า `.env` สำหรับ production และไม่ commit/ส่งต่อไฟล์ลับ
- ตั้ง reverse proxy ให้ `/api` ไป backend
- เปิด HTTPS ที่ web server หรือ load balancer
- ตรวจ backup/restore database
- ตรวจสิทธิ์ admin/agent ให้ตรงกับงานจริง
