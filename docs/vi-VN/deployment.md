# Hướng dẫn triển khai

Dự án này sử dụng tích hợp GitHub của Deno Deploy để triển khai, không dùng GitHub Actions để triển khai ứng dụng. GitHub Actions chỉ phụ trách chạy
`deno task check`, còn Deno Deploy phụ trách build và định tuyến ứng dụng sau khi repository có push.

## Triển khai theo branch

Deno Deploy sẽ tạo các timeline khác nhau cho cùng một App:

- `main`: triển khai bản phát hành chính thức, được định tuyến đến Production URL
- `dev`: triển khai thử nghiệm trước phát hành, được định tuyến đến Git Branch / DEV URL

Khi App hiện tại có tên `heybox-topic-notifier`, quy ước URL gần như sau:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Bản triển khai thử nghiệm `dev` hiện tại đã được tạo, và lối vào thử nghiệm ổn định là Git Branch / DEV URL. Các lần push tiếp theo lên `dev`
sẽ kích hoạt cập nhật bản triển khai thử nghiệm, còn push lên `main` sẽ kích hoạt cập nhật Production.

Tích hợp GitHub của Deno Deploy có thể tạo Git Branch timeline và Build cho các push lên branch tính năng. Để tránh Preview
và các branch tính năng thông thường đọc KV, lấy dữ liệu Heybox hoặc gửi thông báo lặp lại, entrypoint triển khai sẽ khai báo Cron ở cấp cao nhất, nhưng handler chỉ tiếp tục thực thi khi
`DENO_TIMELINE=production` hoặc `DENO_TIMELINE=git-branch/dev`. Các request trang thông thường, root path,
health check và request Warm up
sẽ không kích hoạt polling tự động; các truy vấn đến hạn trong dưới một phút ở trang frontend sẽ kích hoạt lập lịch cho tài khoản hiện tại thông qua một state API được kiểm soát.

## Cấu hình Deno Deploy

Giữ cấu hình sau trong Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

Cấu hình deploy trong `deno.json` là nguồn cấu hình phía repository duy nhất cho entrypoint triển khai.

## Cơ sở dữ liệu

Deno Deploy App đã được liên kết với cơ sở dữ liệu Deno KV. Code sử dụng `Deno.openKv()`
để đọc và ghi tài khoản, thiết lập, lịch sử, trạng thái polling và dấu mốc bài đăng đã xử lý. Mật khẩu tài khoản được lưu dưới dạng hash PBKDF2 có salt; dữ liệu người dùng được tách biệt theo tiền tố user
ID, và Deno Deploy cũng tách dữ liệu Production và Git Branch theo timeline.

## Biến môi trường runtime

Cấu hình trong Deno Deploy App theo nhu cầu. File `.env.example` ở root repository đã được sắp xếp theo kịch bản: mặc định chỉ bật cấu hình tối thiểu có thể dùng được,
còn các cấu hình khác về tinh chỉnh polling, kênh thông báo, relay và security allowlist vẫn được comment; dùng kịch bản nào thì bỏ comment các dòng tương ứng.

- Giá trị mặc định cơ bản: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

Ứng dụng cung cấp trang đăng ký và đăng nhập. Thông tin tài khoản, phiên đăng nhập, cũng như thiết lập, bản ghi khớp, trạng thái polling và cấu hình thông báo của từng tài khoản đều được lưu trong
Deno KV và được tách biệt theo user ID. Browser Cookie chỉ lưu random session token; server lưu token
hash và thời gian hết hạn.

Việc lấy chủ đề Heybox thật hiện là nguồn dữ liệu runtime duy nhất. Mặc định `HEYBOX_SIGNATURE_MODE=app` sử dụng danh sách thời gian đăng của App API đã được xác minh;
`web` chỉ được giữ lại làm fallback chẩn đoán. `POLL_ENABLED`
chỉ là công tắc polling ban đầu cho tài khoản mới hoặc tài khoản mặc định; việc có thực sự lấy dữ liệu hay không phụ thuộc vào “Enable polling” trong trang thiết lập của từng tài khoản.

## Relay thông báo

Nếu Deno Deploy không thể truy cập trực tiếp PushPlus, WxPusher hoặc Server酱, bạn có thể triển khai trước một Cloudflare Worker
relay miễn phí. `workers/notification-relay.js` trong repository cung cấp cố định ba entry chuyển tiếp `/pushplus`, `/wxpusher` và `/serverchan`,
và dùng `Authorization: Bearer <token>` để xác thực; xem các bước đầy đủ trong [worker.md](worker.md).

Ví dụ cấu hình phía Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Xác minh

Sau khi triển khai xong, truy cập:

```text
/healthz
```

Nếu trả về `status: ok`, nghĩa là service process đã khởi động, và health check không đọc Deno KV.