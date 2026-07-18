# Worker relay thông báo

`notification-relay.js` là một relay nhẹ dùng cho Cloudflare Workers, chỉ cung cấp:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API chính thức của Server酱
- `GET /healthz` health check

Nó không nhận target URL tùy ý, vì vậy không thể bị dùng làm open proxy. Entry Server酱 chỉ nhận
SendKey an toàn và tạo địa chỉ chính thức theo các quy tắc hiện có của dự án.

## Các bước triển khai

1. Tạo một Worker miễn phí trong Cloudflare Workers.
2. Dán nội dung của `workers/notification-relay.js` vào Worker editor, hoặc triển khai script này bằng Wrangler.
3. Thêm `RELAY_TOKEN` vào variables/secrets của Worker, dùng một random secret dài làm giá trị.
4. Sau khi triển khai, truy cập `https://<your-worker>.workers.dev/healthz` và xác nhận trả về `{"status":"ok"}`.
5. Cấu hình Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Phía dự án chỉ gửi nội dung sau khi địa chỉ gửi của PushPlus, WxPusher hoặc Server酱 được đổi thành địa chỉ relay:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Relay Server酱 cũng sẽ truyền SendKey qua một request header chuyên dụng:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Kiểm thử trong console

Bạn có thể kiểm tra trước xem xác thực có hoạt động hay không trong Worker console hoặc bằng curl cục bộ:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Kiểm thử WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Kiểm thử Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```