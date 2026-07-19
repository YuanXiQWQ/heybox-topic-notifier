# 通知中繼 Worker

`notification-relay.js` 是給 Cloudflare Workers 使用的輕量中繼，只提供：

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server醬 官方介面
- `GET /healthz` 健康檢查

它不會接受任意目標 URL，因此不能被當成開放代理使用。Server醬 入口只接受安全的
SendKey，並依專案現有規則建構官方位址。

## 部署步驟

1. 在 Cloudflare Workers 建立一個免費 Worker。
2. 將 `workers/notification-relay.js` 的內容貼到 Worker 編輯器，或用 Wrangler 部署該腳本。
3. 在 Worker 的變數/金鑰中新增 `RELAY_TOKEN`，值使用一段隨機長金鑰。
4. 部署後造訪 `https://<your-worker>.workers.dev/healthz`，確認返回 `{"status":"ok"}`。
5. 在 Deno Deploy 設定：

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

專案側只有在 PushPlus、WxPusher 或 Server醬 傳送位址被改成中繼位址時，才會傳送：

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server醬 中繼還會透過專用請求標頭傳遞 SendKey：

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## 控制台測試

可以先在 Worker 控制台或本機 curl 測試驗證是否生效：

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher 測試：

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server醬 測試：

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```