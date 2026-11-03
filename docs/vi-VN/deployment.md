# Hướng dẫn triển khai

Dịch vụ Deno chạy trên Oracle Cloud và dùng Caddy cho HTTPS. Tài khoản, phiên đăng nhập và kết quả được lưu trong Turso. GitHub Actions tạo bộ cài Windows và Android từ thẻ phát hành.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Biến môi trường runtime

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Dùng cơ sở dữ liệu riêng cho môi trường thử nghiệm. Sau khi dừng kiểm tra định kỳ trên máy chủ cũ, đặt `VM_POLLING_ENABLED=true` trên máy chủ chính và khởi động lại dịch vụ.

- Giá trị mặc định cơ bản: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Tinh chỉnh polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Ghi đè request Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Mục thông báo chung: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Thông báo Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Thông báo email: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Relay thông báo: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist bảo mật outbound: `OUTBOUND_ALLOWED_HOSTS`

Quá trình gửi thông báo sẽ xác thực các target của custom Webhook, Email API và SMTP. Mặc định chỉ cho phép public HTTPS URL và các cổng SMTP
phổ biến; nếu cần dùng relay tự host hoặc dịch vụ email cố định, có thể dùng `OUTBOUND_ALLOWED_HOSTS` phân tách bằng dấu phẩy
để cho phép rõ ràng các host tương ứng, ví dụ `relay.example.com,smtp.example.com`.
Sau khi đặt biến này, target outbound của thông báo phải khớp với host trong danh sách hoặc wildcard dạng `*.example.com`.

HTTP redirect được xác thực theo từng hop, và chỉ cho phép redirect same-origin. Khi chưa cấu hình `OUTBOUND_ALLOWED_HOSTS`, kết quả phân giải DNS
A/AAAA của target host cũng sẽ được kiểm tra để bảo đảm không rơi vào localhost, mạng nội bộ, link-local, metadata service hoặc dải địa chỉ reserved. `OUTBOUND_ALLOWED_HOSTS`
là ranh giới tin cậy do administrator chỉ định rõ ràng; wildcard chỉ nên được cấu hình dưới các domain mà bạn kiểm soát hoàn toàn.

Việc lấy chủ đề Heybox thật hiện là nguồn dữ liệu runtime duy nhất. Mặc định `HEYBOX_SIGNATURE_MODE=app` sử dụng danh sách thời gian đăng của App API đã được xác minh;
`web` chỉ được giữ lại làm fallback chẩn đoán.
Tài khoản mới bắt đầu với polling tắt và chỉ lấy dữ liệu sau khi bật “Enable polling” trong trang thiết lập của mình.

## Relay thông báo

Nếu Oracle Cloud không thể truy cập trực tiếp PushPlus, WxPusher hoặc Server酱, bạn có thể triển khai trước một Cloudflare Worker
relay miễn phí. `workers/notification-relay.js` trong repository cung cấp cố định ba entry chuyển tiếp `/pushplus`, `/wxpusher` và `/serverchan`,
và dùng `Authorization: Bearer <token>` để xác thực; xem các bước đầy đủ trong [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Xác minh

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
