# 部署說明

正式服務在 Oracle Cloud 虛擬機器上執行。Caddy 提供 HTTPS，Deno 程序負責輪詢與通知，Turso 儲存帳戶、工作階段及紀錄。發行標籤會觸發 GitHub Actions 建置 Windows 與 Android 安裝檔案。

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## 運行環境變數

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

測試實例使用獨立資料庫。停止舊服務的輪詢後，在正式實例設定 `VM_POLLING_ENABLED=true` 並重新啟動服務。

- 基礎預設值：`APP_LOCALE`、`HEYBOX_TOPIC_ID`、`NOTIFIER_PROVIDER`
- 輪詢調優：`POLL_INTERVAL_MINUTES`、`POLL_POST_LIMIT`、`POLL_SORT`
- 小黑盒請求覆蓋：`HEYBOX_SIGNATURE_MODE`、`HEYBOX_DEVICE_ID`、`HEYBOX_COOKIE`、 `HEYBOX_USER_AGENT`
- 通知公共項：`NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook 通知：`NOTIFIER_WEBHOOK_SERVICE`、`NOTIFIER_WEBHOOK_URL`、
  `NOTIFIER_PUSHPLUS_TOKEN`、`NOTIFIER_WXPUSHER_SPT`、`NOTIFIER_SERVER_CHAN_SEND_KEY`
- 郵件通知：`NOTIFIER_EMAIL_SERVICE`、`NOTIFIER_EMAIL_ADDRESS`、`NOTIFIER_EMAIL_FROM`、
  `NOTIFIER_EMAIL_API_URL`、`NOTIFIER_EMAIL_API_TOKEN`、`NOTIFIER_SMTP_HOST`、
  `NOTIFIER_SMTP_PORT`、`NOTIFIER_SMTP_SECURE`、`NOTIFIER_SMTP_USERNAME`、 `NOTIFIER_SMTP_PASSWORD`
- 通知中轉：`NOTIFIER_PUSHPLUS_SEND_URL`、`NOTIFIER_WXPUSHER_SEND_URL`、
  `NOTIFIER_SERVER_CHAN_SEND_URL`、`NOTIFIER_RELAY_TOKEN`
- 出站安全白名單：`OUTBOUND_ALLOWED_HOSTS`

通知投遞會校驗自訂 Webhook、Email API 和 SMTP 目標。預設只允許公網 HTTPS URL 和常見 SMTP
端口；如果需要使用自託管中轉或固定郵件服務，可以用逗號分隔的 `OUTBOUND_ALLOWED_HOSTS`
明確允許對應主機，例如 `relay.example.com,smtp.example.com`。
設定該變數後，通知出站目標必須命中列表中的主機或 `*.example.com` 形式的通配符。

HTTP 重定向會逐跳校驗，且只允許同源跳轉；未配置 `OUTBOUND_ALLOWED_HOSTS` 時，還會校驗目標主機的 DNS
A/AAAA 解析結果不落入本機、內網、鏈路本地、元數據服務或保留地址範圍。`OUTBOUND_ALLOWED_HOSTS`
是管理員明確信任邊界，通配符只應配置在完全控制的域名下。

真實小黑盒話題擷取是當前唯一運行數據源。預設 `HEYBOX_SIGNATURE_MODE=app` 使用已驗證的 App API
發布時間列表；`web` 僅保留為診斷回退。新帳戶預設關閉輪詢，
只有帳戶在設定頁開啟「啟用輪詢」後才會實際擷取。

## 通知中轉

如果 Oracle Cloud 不能直接訪問 PushPlus、WxPusher 或 Server酱，可以先部署免費的 Cloudflare Worker
中轉。倉庫中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三個轉發入口，並使用 `Authorization: Bearer <token>` 鑑權；完整步驟見 [worker.md](worker.md)。

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 驗證

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
