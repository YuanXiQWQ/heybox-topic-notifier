# 部署說明

本項目使用 Deno Deploy 的 GitHub 整合部署，不使用 GitHub Actions 部署應用程式。GitHub Actions 只負責運行
`deno task check`，Deno Deploy 負責在倉庫 push 後構建並路由應用程式。

## 分支部署

Deno Deploy 會為同一個 App 建立不同 timeline：

- `main`：正式發布部署，路由到 Production URL
- `dev`：發布前測試部署，路由到 Git Branch / DEV URL

當前 App 名為 `heybox-topic-notifier` 時，URL 約定為：

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

當前 `dev` 測試部署已經建立，穩定測試入口是 Git Branch / DEV URL。後續推送到 `dev`
會觸發測試部署更新，推送到 `main` 會觸發 Production 更新。

Deno Deploy 的 GitHub 整合可能會為功能分支 push 建立 Git Branch timeline 和 Build。為了避免 Preview
和普通功能分支重複讀取 KV、擷取小黑盒或發送通知，部署入口會在頂層聲明 Cron，但 handler 只會在
`DENO_TIMELINE=production` 或 `DENO_TIMELINE=git-branch/dev` 時繼續執行。普通頁面請求、根路徑、
健康檢查和 Warm up
請求不會觸發自動輪詢；前台頁面低於一分鐘的到點查詢會通過受控狀態接口觸發當前帳戶調度。

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一倉庫配置來源。

## 數據庫

Deno Deploy App 已綁定 Deno KV 數據庫。代碼通過 `Deno.openKv()`
讀寫帳戶、設定、歷史記錄、輪詢狀態和已處理帖子標記。帳戶密碼以加鹽 PBKDF2 雜湊保存；使用者數據按使用者
ID 前綴隔離，Deno Deploy 亦會按 timeline 隔離 Production 和 Git Branch 數據。

## 運行環境變數

Deno Deploy App 中按需配置。倉庫根目錄的 `.env.example` 已按場景整理：預設只啟用最小可用配置，
其他輪詢調優、通知渠道、中轉和安全白名單配置保持註釋，使用哪個場景再取消對應行。

- 基礎預設值：`APP_LOCALE`、`HEYBOX_TOPIC_ID`、`POLL_ENABLED`、`NOTIFIER_PROVIDER`
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

應用程式提供註冊和登入頁面。帳戶資料、登入會話，以及各帳戶的設定、命中記錄、輪詢狀態、通知配置都儲存在
Deno KV 中，並按使用者 ID 隔離。瀏覽器 Cookie 只保存隨機 session token；伺服器端保存 token
雜湊和過期時間。

真實小黑盒話題擷取是當前唯一運行數據源。預設 `HEYBOX_SIGNATURE_MODE=app` 使用已驗證的 App API
發布時間列表；`web` 僅保留為診斷回退。`POLL_ENABLED`
只作為新帳戶或預設帳戶的初始輪詢開關；是否實際擷取，以各帳戶設定頁中的「啟用輪詢」為準。

## 通知中轉

如果 Deno Deploy 不能直接訪問 PushPlus、WxPusher 或 Server酱，可以先部署免費的 Cloudflare Worker
中轉。倉庫中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三個轉發入口，並使用 `Authorization: Bearer <token>` 鑑權；完整步驟見 [worker.md](worker.md)。

Deno Deploy 側配置示例：

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 驗證

部署完成後訪問：

```text
/healthz
```

返回 `status: ok` 即代表服務進程已啟動，且健康檢查不會讀取 Deno KV。