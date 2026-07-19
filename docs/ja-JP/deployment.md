# デプロイ説明

本プロジェクトは Deno Deploy の GitHub 連携でデプロイし、GitHub Actions ではアプリをデプロイしません。GitHub Actions は
`deno task check` の実行のみを担当し、リポジトリへの push 後のビルドとルーティングは Deno Deploy が担当します。

## ブランチデプロイ

Deno Deploy は同一 App に対して異なる timeline を作成します。

- `main`: 正式リリース用デプロイ。Production URL にルーティング
- `dev`: リリース前検証用デプロイ。Git Branch / DEV URL にルーティング

現在の App 名が `heybox-topic-notifier` の場合、URL 規約はおおむね次のとおりです。

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

現在の `dev` 検証用デプロイは既に作成済みで、安定した検証入口は Git Branch / DEV URL です。以後 `dev` へ push
すると検証用デプロイが更新され、`main` へ push すると Production が更新されます。

Deno Deploy の GitHub 連携は、機能ブランチへの push に対して Git Branch timeline と Build を作成する場合があります。Preview
および通常の機能ブランチが KV 読取、小黑盒取得、通知送信を重複実行しないよう、デプロイ入口では最上位で Cron を宣言しますが、handler は
`DENO_TIMELINE=production` または `DENO_TIMELINE=git-branch/dev` の場合だけ実行を継続します。通常のページ要求、ルートパス、
ヘルスチェック、Warm up
要求は自動ポーリングを起動しません。前台ページで 1 分未満の到達時刻確認がある場合は、制御済み状態 API 経由で現在アカウントのスケジュールを起動します。

## Deno Deploy 設定

Deno Deploy App では次の設定を維持してください。

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` 内の deploy 設定は、デプロイ入口に関する唯一のリポジトリ側設定源です。

## データベース

Deno Deploy App には Deno KV データベースが紐付け済みです。コードは `Deno.openKv()`
を通じて、アカウント、設定、履歴、ポーリング状態、処理済み投稿マーカーを読書きします。アカウントのパスワードは salt 付き PBKDF2 ハッシュとして保存されます。ユーザーデータは user
ID プレフィックスで分離され、Deno Deploy も timeline ごとに Production と Git Branch のデータを分離します。

## 実行環境変数

Deno Deploy App 側で必要に応じて設定します。リポジトリルートの `.env.example` は場面別に整理されています。既定では最小限の利用可能設定だけが有効で、
その他のポーリング調整、通知経路、中継、安全許可リスト設定はコメントのままです。利用する場面に応じて該当行だけコメント解除してください。

- 基本既定値: `APP_LOCALE`、`HEYBOX_TOPIC_ID`、`POLL_ENABLED`、`NOTIFIER_PROVIDER`
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

アプリは登録画面とログイン画面を提供します。アカウント情報、ログインセッション、各アカウントの設定、命中記録、ポーリング状態、通知設定は
Deno KV に保存され、user ID ごとに分離されます。ブラウザー Cookie にはランダムな session token だけを保存し、サーバー側には token
ハッシュと有効期限を保存します。

実際の小黑盒話題取得は、現在唯一の実行時データソースです。既定の `HEYBOX_SIGNATURE_MODE=app` は検証済みの App API
投稿時刻リストを使用します。`web` は診断用フォールバックとしてのみ残しています。`POLL_ENABLED`
は新規アカウントまたは既定アカウントの初期ポーリングスイッチにすぎません。実際に取得するかどうかは、各アカウント設定画面の「ポーリングを有効化」に従います。

## 通知中継

Deno Deploy から PushPlus、WxPusher、Server酱 へ直接アクセスできない場合は、先に無料の Cloudflare Worker
中継をデプロイできます。リポジトリ内の `workers/notification-relay.js` は `/pushplus`、`/wxpusher`、`/serverchan`
の 3 つの転送入口を固定で提供し、`Authorization: Bearer <token>` で認証します。詳細手順は [worker.md](worker.md) を参照してください。

Deno Deploy 側の設定例:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 検証

デプロイ完了後、次へアクセスします。

```text
/healthz
```

`status: ok` が返れば、サービスプロセスは起動済みであり、ヘルスチェックは Deno KV を読みません。