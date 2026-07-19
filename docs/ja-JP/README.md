# Heybox 話題通知器

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **日本語** |
|:-----------------------:|:-------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
は、Heybox の話題投稿を監視する軽量な Deno アプリです。各アカウント設定に従って
実際の話題投稿を定期的に取得し、表題、本文、コメント、返信をキーワード規則と照合し、
一致結果を保留中および履歴画面に記録し、設定済みの通知経路から通知を送信します。

## 機能

- ダッシュボード: 取得状態、総一致数、最新一致、保留中一致を表示し、手動確認を実行
- 設定画面: 話題 ID、有効状態、注記、取得間隔単位、投稿上限、並び順、UI 言語、
  ダークモード、テーマ色を設定
- アカウント設定: 登録、ログイン、ログアウト、ユーザー名更新、パスワード更新に対応；
  アカウントデータはユーザー ID ごとに分離
- キーワード規則: 共有規則、話題別規則、一致位置、大文字小文字の区別、正規表現に対応
- 一致表: 保留中および履歴の記録は、時間範囲フィルター、ページ分割、一括完了、削除操作に対応
- デバッグ項目: 模擬一致と通知テストを提供し、手動取得とデバッグ操作にはサーバー側の
  レート制限を適用
- 通知経路: カスタム Webhook、ServerChan、PushPlus、WxPusher、email API、SMTP
- 通知中継: PushPlus、WxPusher、ServerChan 用の任意 Cloudflare Worker 中継
- セキュリティ: PBKDF2 パスワードハッシュ、KV ベースのセッション、CSRF トークン、
  セキュリティヘッダー、監査ログ、DNS 検証付きの送信先許可リスト

## 技術構成

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + ローカルタイマー式スケジューラー
- サーバー側生成 HTML + 素の JavaScript/CSS
- 通知中継用 Cloudflare Workers スクリプト

## ローカル開発

開発サーバーを起動します:

```powershell
deno task dev
```

次に開きます:

```text
http://localhost:8000
```

既定値を上書きするには、`.env.example` を参照し、実行環境で対応する環境変数を設定してください。
初回訪問時にアカウントを登録します。環境変数は新規アカウントまたは既定データの初期値を
投入するためだけに使用され、その後は各アカウントの設定画面が信頼できる唯一の情報源になります。

このアプリは登録画面とログイン画面を提供します。各アカウントには独立した設定、一致履歴、
取得状態、通知設定があり、同じデプロイ URL を共有するユーザー同士でもデータは共有されません。
ユーザーパスワードは平文ではなく、salt 付き PBKDF2 ハッシュとして Deno KV に保存されます。
ログインセッションは Deno KV に保存され、ブラウザー Cookie にはランダムなセッショントークンのみが
含まれます。設定、アカウント、デバッグ関連の変更では CSRF トークンを検証し、公開デプロイでは
機密性の高い操作にレート制限が適用されます。

## コマンド

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` は処理済み投稿マーカーを消去し、同じ投稿を再度検証できるようにします。
本番環境では注意して使用してください。

## デプロイ

Deno Deploy の設定については [deployment](./deployment.md) を参照してください。アプリの入口点は
`deno.json` の `deploy` セクションで定義されます。GitHub Actions は検査のみを実行し、アプリを
デプロイしません。`src/deploy.ts` のデプロイ入口点は Deno Deploy Cron を宣言し、実際の取得処理は
Production と `dev` Git Branch タイムラインでのみ実行されます。通知中継 Worker の設定については
[worker](./worker.md) を参照してください。

## ライセンス

このプロジェクトは [GNU Affero General Public License v3.0](../../LICENSE) の下でライセンスされています。