# 알림 릴레이 Worker

`notification-relay.js`는 Cloudflare Workers용 경량 릴레이이며, 다음만 제공합니다.

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server酱 공식 API
- `GET /healthz` health check

임의의 대상 URL을 받지 않으므로 open proxy로 사용할 수 없습니다. Server酱 entry는 안전한
SendKey만 받으며, 프로젝트의 기존 규칙에 따라 공식 주소를 구성합니다.

## 배포 단계

1. Cloudflare Workers에서 무료 Worker를 만드세요.
2. `workers/notification-relay.js`의 내용을 Worker 편집기에 붙여 넣거나, Wrangler로 이 스크립트를 배포하세요.
3. Worker의 변수/secret에 `RELAY_TOKEN`을 추가하고, 값으로 긴 random secret을 사용하세요.
4. 배포 후 `https://<your-worker>.workers.dev/healthz`에 접속해 `{"status":"ok"}`가 반환되는지 확인하세요.
5. Deno Deploy를 구성하세요.

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

프로젝트 측은 PushPlus, WxPusher 또는 Server酱의 전송 주소가 릴레이 주소로 변경된 경우에만 다음을 보냅니다.

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 릴레이는 전용 request header를 통해 SendKey도 전달합니다.

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## 콘솔 테스트

먼저 Worker 콘솔 또는 로컬 curl로 인증이 적용되는지 테스트할 수 있습니다.

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher 테스트:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server酱 테스트:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```