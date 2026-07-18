# Notification Relay Worker

`notification-relay.js` is a lightweight relay for Cloudflare Workers. It only provides:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> the official ServerChan endpoint
- `GET /healthz` health check

It does not accept arbitrary target URLs, so it cannot be used as an open proxy. The ServerChan
entrypoint only accepts safe SendKeys and builds the official URL with the project's existing rules.

## Deployment Steps

1. Create a free Worker in Cloudflare Workers.
2. Paste the contents of `workers/notification-relay.js` into the Worker editor, or deploy the
   script with Wrangler.
3. Add `RELAY_TOKEN` to the Worker's variables or secrets, using a long random secret.
4. After deployment, visit `https://<your-worker>.workers.dev/healthz` and confirm it returns
   `{"status":"ok"}`.
5. Configure Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

The project only sends this header when the PushPlus, WxPusher, or ServerChan sends a URL that has been changed to the relay URL:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

The ServerChan relay also passes the SendKey through a dedicated request header:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Console Testing

You can test whether authentication works from the Worker console or local curl first:

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

ServerChan test:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```