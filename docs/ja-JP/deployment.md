# デプロイ説明

本番環境では Oracle Cloud 上で Deno が動作し、Caddy が HTTPS を提供します。アカウント、セッション、記録は Turso に保存されます。リリースタグを付けると GitHub Actions が Windows と Android の配布ファイルを作成します。

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## 実行環境変数

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

検証環境には専用のデータベースを用意します。旧環境の定期取得を停止してから、本番環境に `VM_POLLING_ENABLED=true` を設定し、サービスを再起動してください。

- 基本既定値: `APP_LOCALE`、`HEYBOX_TOPIC_ID`、`NOTIFIER_PROVIDER`
- ポーリング調整: `POLL_INTERVAL_MINUTES`、`POLL_POST_LIMIT`、`POLL_SORT`
- 小黑盒要求上書き: `HEYBOX_SIGNATURE_MODE`、`HEYBOX_DEVICE_ID`、`HEYBOX_COOKIE`、`HEYBOX_USER_AGENT`
- 通知共通項目: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook 通知: `NOTIFIER_WEBHOOK_SERVICE`、`NOTIFIER_WEBHOOK_URL`、
  `NOTIFIER_PUSHPLUS_TOKEN`、`NOTIFIER_WXPUSHER_SPT`、`NOTIFIER_SERVER_CHAN_SEND_KEY`
- メール通知: `NOTIFIER_EMAIL_SERVICE`、`NOTIFIER_EMAIL_ADDRESS`、`NOTIFIER_EMAIL_FROM`、
  `NOTIFIER_EMAIL_API_URL`、`NOTIFIER_EMAIL_API_TOKEN`、`NOTIFIER_SMTP_HOST`、
  `NOTIFIER_SMTP_PORT`、`NOTIFIER_SMTP_SECURE`、`NOTIFIER_SMTP_USERNAME`、`NOTIFIER_SMTP_PASSWORD`
- 通知中継: `NOTIFIER_PUSHPLUS_SEND_URL`、`NOTIFIER_WXPUSHER_SEND_URL`、
  `NOTIFIER_SERVER_CHAN_SEND_URL`、`NOTIFIER_RELAY_TOKEN`
- 送信先安全許可リスト: `OUTBOUND_ALLOWED_HOSTS`

通知配信時は、カスタム Webhook、Email API、SMTP の送信先を検証します。既定では公開 HTTPS URL と一般的な SMTP
ポートのみ許可します。自前ホストの中継や固定メールサービスを使う必要がある場合は、カンマ区切りの `OUTBOUND_ALLOWED_HOSTS`
で対象ホストを明示許可できます。例: `relay.example.com,smtp.example.com`。
この変数を設定した後は、通知の送信先が一覧内のホストまたは `*.example.com` 形式のワイルドカードに一致する必要があります。

HTTP リダイレクトは hop ごとに検証し、同一 origin の遷移だけを許可します。`OUTBOUND_ALLOWED_HOSTS` が未設定の場合は、対象ホストの DNS
A/AAAA 解決結果が localhost、内部ネットワーク、link-local、metadata service、予約済みアドレス範囲に入らないことも検証します。`OUTBOUND_ALLOWED_HOSTS`
は管理者が明示する信頼境界です。ワイルドカードは完全に管理できるドメイン配下だけに設定してください。

実際の小黑盒話題取得は、現在唯一の実行時データソースです。既定の `HEYBOX_SIGNATURE_MODE=app` は検証済みの App API
投稿時刻リストを使用します。`web` は診断用フォールバックとしてのみ残しています。
新規アカウントはポーリング無効の状態で始まり、設定画面で「ポーリングを有効化」をオンにした後だけ実際に取得します。

## 通知中継

Oracle Cloud から PushPlus、WxPusher、Server酱 へ直接アクセスできない場合は、先に無料の Cloudflare Worker
中継をデプロイできます。リポジトリ内の `workers/notification-relay.js` は `/pushplus`、`/wxpusher`、`/serverchan`
の 3 つの転送入口を固定で提供し、`Authorization: Bearer <token>` で認証します。詳細手順は [worker.md](worker.md) を参照してください。

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 検証

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
