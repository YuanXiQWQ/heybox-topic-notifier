# Notification relay Worker

`notification-relay.js` হলো Cloudflare Workers-এর জন্য একটি lightweight relay, যা শুধু দেয়:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server酱 official API
- `GET /healthz` health check

এটি arbitrary target URL গ্রহণ করে না, তাই open proxy হিসেবে ব্যবহার করা যাবে না। Server酱 entry শুধু secure
SendKey গ্রহণ করে এবং project-এর existing rules অনুযায়ী official address তৈরি করে।

## Deployment steps

1. Cloudflare Workers-এ একটি free Worker তৈরি করুন।
2. `workers/notification-relay.js`-এর content Worker editor-এ paste করুন, অথবা Wrangler দিয়ে script deploy করুন।
3. Worker variables/secrets-এ `RELAY_TOKEN` যোগ করুন, value হিসেবে একটি long random secret ব্যবহার করুন।
4. Deployment-এর পর `https://<your-worker>.workers.dev/healthz` visit করে `{"status":"ok"}` return হচ্ছে কি না নিশ্চিত করুন।
5. Deno Deploy-এ configure করুন:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Project-side শুধু তখনই পাঠাবে, যখন PushPlus, WxPusher অথবা Server酱 send address relay address-এ changed হবে:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 relay dedicated request header দিয়ে SendKey pass করবে:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Console test

প্রথমে Worker console বা local curl দিয়ে authentication কার্যকর কি না test করতে পারেন:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher test:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server酱 test:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```