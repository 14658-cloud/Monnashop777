# Discord Ticket Bot

## สิ่งที่ต้องตั้งค่า
ใส่ Environment Variables 4 ตัว:
- BOT_TOKEN
- SERVER_ID
- STAFF_ROLE_ID
- TICKET_CATEGORY_ID

ไม่ควรใส่ Bot Token ลงในโค้ดหรืออัปโหลดลง GitHub

## คำสั่ง
- /ticket — ใช้โดยสมาชิกที่มี Staff Role เพื่อส่ง Ticket Panel
- 🎫 เปิด Ticket — สร้างห้องส่วนตัว
- 🔒 ปิด Ticket — เจ้าของ Ticket หรือ Staff ใช้ปิดได้

## Local
npm install
npm start

## Hosting
ใช้ Start Command:
npm start

ใช้ Node.js 20 ขึ้นไป

## Discord Bot Permissions
บอทควรมี:
- View Channels
- Send Messages
- Read Message History
- Manage Channels
- Manage Messages
- Embed Links
- Attach Files

และ Role ของบอทต้องอยู่สูงกว่า Staff Role ที่เกี่ยวข้องกับการจัดการช่อง
