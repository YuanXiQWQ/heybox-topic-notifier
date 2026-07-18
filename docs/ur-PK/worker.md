# Notification relay Worker

`notification-relay.js` Cloudflare Workers کے لیے ایک lightweight relay ہے، جو صرف یہ فراہم کرتا ہے:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server酱 official API
- `GET /healthz` health check

یہ arbitrary target URL قبول نہیں کرتا، اس لیے اسے open proxy کے طور پر استعمال نہیں کیا جا سکتا۔ Server酱 entry صرف secure
SendKey قبول کرتی ہے، اور project کے existing rules کے مطابق official address بناتی ہے۔

## Deployment steps

1. Cloudflare Workers میں ایک free Worker بنائیں۔
2. `workers/notification-relay.js` کا content Worker editor میں paste کریں، یا Wrangler سے اس script کو deploy کریں۔
3. Worker variables/secrets میں `RELAY_TOKEN` شامل کریں، value کے طور پر ایک long random secret استعمال کریں۔
4. Deployment کے بعد `https://<your-worker>.workers.dev/healthz` visit کریں، اور confirm کریں کہ `{"status":"ok"}` return ہو رہا ہے۔
5. Deno Deploy configure کریں:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Project side صرف تب درج ذیل بھیجے گا جب PushPlus، WxPusher یا Server酱 send address relay address میں بدل دیا گیا ہو:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 relay dedicated request header سے SendKey بھی pass کرے گا:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Console test

پہلے Worker console یا local curl میں authentication effective ہے یا نہیں test کر سکتے ہیں:

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