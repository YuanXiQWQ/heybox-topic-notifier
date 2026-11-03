# คำแนะนำการ Deploy

บริการ Deno ทำงานบน Oracle Cloud โดยใช้ Caddy สำหรับ HTTPS บัญชี เซสชัน และผลลัพธ์จัดเก็บใน Turso ส่วน GitHub Actions สร้างตัวติดตั้ง Windows และ Android จากแท็กเผยแพร่

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Runtime Environment Variables

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

ใช้ฐานข้อมูลแยกสำหรับการทดสอบ เมื่อหยุดการตรวจสอบเป็นระยะบนเซิร์ฟเวอร์เดิมแล้ว ให้ตั้งค่า `VM_POLLING_ENABLED=true` บนเซิร์ฟเวอร์จริงและเริ่มบริการใหม่

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Polling tuning: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox request overrides: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Common notification item: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notifications: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notifications: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

การส่ง notification จะ validate target ของ custom Webhook, Email API และ SMTP ค่าเริ่มต้นอนุญาตเฉพาะ public HTTPS URL และ SMTP
port ทั่วไปเท่านั้น หากต้องใช้ self-hosted relay หรือ fixed mail service สามารถใช้ `OUTBOUND_ALLOWED_HOSTS` แบบคั่นด้วย comma
เพื่ออนุญาต host ที่เกี่ยวข้องอย่างชัดเจน เช่น `relay.example.com,smtp.example.com`
หลังจากตั้งค่าตัวแปรนี้แล้ว outbound target ของ notification ต้องตรงกับ host ใน list หรือ wildcard รูปแบบ `*.example.com`

HTTP redirect จะถูก validate ทีละ hop และอนุญาตเฉพาะ same-origin redirect เท่านั้น หากไม่ได้ตั้งค่า `OUTBOUND_ALLOWED_HOSTS` จะ validate ผล DNS
A/AAAA ของ target host ด้วยว่าไม่อยู่ในช่วง localhost, internal network, link-local, metadata service หรือ reserved address range `OUTBOUND_ALLOWED_HOSTS`
เป็น trust boundary ที่ administrator กำหนดอย่างชัดเจน และควรตั้งค่า wildcard เฉพาะภายใต้ domain ที่ควบคุมได้ทั้งหมดเท่านั้น

การ fetch หัวข้อ Heybox จริงเป็น runtime data source เพียงแหล่งเดียวในปัจจุบัน ค่าเริ่มต้น `HEYBOX_SIGNATURE_MODE=app` ใช้ publish-time list ของ App API ที่ผ่านการตรวจสอบแล้ว;
`web` ถูกเก็บไว้เป็น diagnostic fallback เท่านั้น
account ใหม่เริ่มต้นด้วย polling ที่ปิดอยู่ และจะ fetch ข้อมูลหลังเปิด “Enable polling” ใน settings page ของตนเองเท่านั้น

## Notification Relay

หาก Oracle Cloud ไม่สามารถเข้าถึง PushPlus, WxPusher หรือ Server酱 โดยตรงได้ สามารถ deploy Cloudflare Worker
relay แบบฟรีก่อนได้ `workers/notification-relay.js` ใน repository มี forwarding entry แบบ fixed สามรายการคือ `/pushplus`, `/wxpusher` และ `/serverchan`
และใช้ `Authorization: Bearer <token>` สำหรับ authentication; ดูขั้นตอนทั้งหมดใน [worker.md](worker.md)

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## การตรวจสอบ

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
