# Notification Relay Worker

`notification-relay.js` เป็น relay ขนาดเบาสำหรับ Cloudflare Workers และให้บริการเฉพาะ:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API ทางการของ Server酱
- `GET /healthz` health check

ไม่รับ target URL แบบกำหนดเองใด ๆ ดังนั้นจึงไม่สามารถใช้เป็น open proxy ได้ entry ของ Server酱 จะรับเฉพาะ
SendKey ที่ปลอดภัย และสร้าง official address ตาม rules ที่มีอยู่ของ project

## ขั้นตอนการ Deploy

1. สร้าง Worker ฟรีใน Cloudflare Workers
2. วางเนื้อหาของ `workers/notification-relay.js` ลงใน Worker editor หรือ deploy script นี้ด้วย Wrangler
3. เพิ่ม `RELAY_TOKEN` ใน variables/secrets ของ Worker โดยใช้ค่าเป็น random secret ที่ยาว
4. หลัง deploy แล้ว ให้เข้าถึง `https://<your-worker>.workers.dev/healthz` และยืนยันว่าคืนค่า `{"status":"ok"}`
5. ตั้งค่า Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

ฝั่ง project จะส่งค่าต่อไปนี้เฉพาะเมื่อ send address ของ PushPlus, WxPusher หรือ Server酱 ถูกเปลี่ยนเป็น relay address แล้วเท่านั้น:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 relay จะส่ง SendKey ผ่าน request header เฉพาะด้วย:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## การทดสอบใน Console

สามารถทดสอบก่อนว่า authentication ทำงานหรือไม่ใน Worker console หรือด้วย local curl:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

ทดสอบ WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

ทดสอบ Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```