# คำแนะนำการ Deploy

โปรเจกต์นี้ใช้ GitHub integration ของ Deno Deploy สำหรับการ deploy และไม่ได้ใช้ GitHub Actions เพื่อ deploy แอป GitHub Actions มีหน้าที่เพียงเรียกใช้
`deno task check` ส่วน Deno Deploy จะรับผิดชอบการ build และ route แอปหลังจากมี push ไปยัง repository

## การ Deploy ตาม Branch

Deno Deploy จะสร้าง timeline ที่แตกต่างกันสำหรับ App เดียวกัน:

- `main`: deployment สำหรับ release อย่างเป็นทางการ route ไปยัง Production URL
- `dev`: deployment สำหรับทดสอบก่อน release route ไปยัง Git Branch / DEV URL

เมื่อ App ปัจจุบันชื่อ `heybox-topic-notifier` ข้อตกลง URL จะประมาณนี้:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

deployment ทดสอบ `dev` ปัจจุบันถูกสร้างแล้ว และทางเข้าทดสอบที่เสถียรคือ Git Branch / DEV URL การ push ต่อไปยัง `dev`
จะทำให้ deployment ทดสอบอัปเดต ส่วนการ push ไปยัง `main` จะทำให้ Production อัปเดต

GitHub integration ของ Deno Deploy อาจสร้าง Git Branch timeline และ Build สำหรับการ push ไปยัง feature branch เพื่อป้องกันไม่ให้ Preview
และ feature branch ทั่วไปอ่าน KV, fetch Heybox หรือส่ง notification ซ้ำ entrypoint ของ deployment จะประกาศ Cron ที่ top level แต่ handler จะดำเนินการต่อเฉพาะเมื่อ
`DENO_TIMELINE=production` หรือ `DENO_TIMELINE=git-branch/dev` เท่านั้น page request ปกติ, root path,
health check และ Warm up
request จะไม่ trigger polling อัตโนมัติ; query ใน frontend page ที่ถึงเวลาในช่วงต่ำกว่าหนึ่งนาทีจะ trigger scheduling ของ account ปัจจุบันผ่าน controlled state API

## การตั้งค่า Deno Deploy

คงการตั้งค่าต่อไปนี้ไว้ใน Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

การตั้งค่า deploy ใน `deno.json` เป็นแหล่ง configuration ฝั่ง repository เพียงแหล่งเดียวสำหรับ deployment entrypoint

## Database

Deno Deploy App ผูกกับ Deno KV database แล้ว โค้ดใช้ `Deno.openKv()`
เพื่ออ่านและเขียน accounts, settings, history, polling state และ processed-post markers รหัสผ่าน account ถูกบันทึกเป็น salted PBKDF2 hashes; user data ถูกแยกตาม prefix ของ user
ID และ Deno Deploy ยังแยกข้อมูล Production กับ Git Branch ตาม timeline ด้วย

## Runtime Environment Variables

ตั้งค่าใน Deno Deploy App ตามความจำเป็น ไฟล์ `.env.example` ที่ root ของ repository ถูกจัดตาม scenario: ค่าเริ่มต้นเปิดใช้งานเฉพาะ configuration ขั้นต่ำที่ใช้งานได้
ส่วน configuration อื่น ๆ สำหรับ polling tuning, notification channels, relay และ security allowlist จะยังถูก comment ไว้ ให้ uncomment เฉพาะบรรทัดที่ตรงกับ scenario ที่ใช้

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

แอปมีหน้า registration และ login ข้อมูล account, login session รวมถึง settings, match records, polling state และ notification configuration ของแต่ละ account จะถูกเก็บใน
Deno KV และแยกตาม user ID Browser Cookie เก็บเฉพาะ random session token; server เก็บ token
hash และเวลาหมดอายุ

การ fetch หัวข้อ Heybox จริงเป็น runtime data source เพียงแหล่งเดียวในปัจจุบัน ค่าเริ่มต้น `HEYBOX_SIGNATURE_MODE=app` ใช้ publish-time list ของ App API ที่ผ่านการตรวจสอบแล้ว;
`web` ถูกเก็บไว้เป็น diagnostic fallback เท่านั้น `POLL_ENABLED`
เป็นเพียง initial polling switch สำหรับ account ใหม่หรือ default account; จะ fetch จริงหรือไม่ขึ้นอยู่กับ “Enable polling” ใน settings page ของแต่ละ account

## Notification Relay

หาก Deno Deploy ไม่สามารถเข้าถึง PushPlus, WxPusher หรือ Server酱 โดยตรงได้ สามารถ deploy Cloudflare Worker
relay แบบฟรีก่อนได้ `workers/notification-relay.js` ใน repository มี forwarding entry แบบ fixed สามรายการคือ `/pushplus`, `/wxpusher` และ `/serverchan`
และใช้ `Authorization: Bearer <token>` สำหรับ authentication; ดูขั้นตอนทั้งหมดใน [worker.md](worker.md)

ตัวอย่าง configuration ฝั่ง Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## การตรวจสอบ

หลังจาก deployment เสร็จแล้ว ให้เข้าถึง:

```text
/healthz
```

หากคืนค่า `status: ok` แสดงว่า service process เริ่มทำงานแล้ว และ health check จะไม่อ่าน Deno KV