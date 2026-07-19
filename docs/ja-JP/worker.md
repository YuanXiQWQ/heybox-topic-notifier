# 通知中継 Worker

`notification-relay.js` は Cloudflare Workers 用の軽量中継で、次だけを提供します。

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> Server酱 公式 API
- `GET /healthz` ヘルスチェック

任意の送信先 URL は受け付けないため、オープンプロキシとしては使用できません。Server酱 入口は安全な
SendKey だけを受け付け、プロジェクト既存規則に従って公式アドレスを構築します。

## デプロイ手順

1. Cloudflare Workers で無料 Worker を作成します。
2. `workers/notification-relay.js` の内容を Worker エディターに貼り付けるか、Wrangler でこのスクリプトをデプロイします。
3. Worker の変数/シークレットに `RELAY_TOKEN` を追加し、値には長いランダム秘密鍵を使用します。
4. デプロイ後、`https://<your-worker>.workers.dev/healthz` にアクセスし、`{"status":"ok"}` が返ることを確認します。
5. Deno Deploy を設定します。

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

プロジェクト側は、PushPlus、WxPusher、Server酱 の送信アドレスが中継アドレスへ変更された場合だけ、次を送信します。

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 中継は専用 request header で SendKey も渡します。

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## コンソールテスト

先に Worker コンソールまたはローカル curl で認証が有効か確認できます。

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher テスト:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server酱 テスト:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```