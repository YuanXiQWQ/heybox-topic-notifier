# Notification relay Worker

`notification-relay.js` Cloudflare Workers के लिए lightweight relay है, जो केवल यह प्रदान करता है:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server酱 official API
- `GET /healthz` health check

यह arbitrary target URL स्वीकार नहीं करता, इसलिए इसे open proxy के रूप में उपयोग नहीं किया जा सकता। Server酱 entry केवल secure
SendKey स्वीकार करती है, और project के existing rules के अनुसार official address बनाती है।

## Deployment steps

1. Cloudflare Workers में एक free Worker बनाएँ।
2. `workers/notification-relay.js` का content Worker editor में paste करें, या Wrangler से इस script को deploy करें।
3. Worker variables/secrets में `RELAY_TOKEN` add करें, value के रूप में लंबा random secret उपयोग करें।
4. Deployment के बाद `https://<your-worker>.workers.dev/healthz` visit करें, और confirm करें कि `{"status":"ok"}` return हो रहा है।
5. Deno Deploy configure करें:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Project side केवल तब निम्न भेजेगा, जब PushPlus, WxPusher या Server酱 send address relay address में बदल दिया गया हो:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 relay dedicated request header से SendKey भी pass करेगा:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Console test

पहले Worker console या local curl में authentication effective है या नहीं test कर सकते हैं:

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