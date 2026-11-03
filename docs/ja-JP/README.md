# Heybox 話題通知器

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **日本語** |
|:-----------------------:|:-------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

設定で小黒盒の話題を追加し、キーワード・正規表現・AI のいずれかで照合条件を設定して、定期取得を有効にします。該当する投稿は作業一覧に表示され、履歴への移動や復元ができます。

新規登録には招待コードが必要です。アプリ通知は端末ごとに設定でき、メールや Webhook と併用できます。オフラインでの編集は再接続時に同期されます。言語とダークモードの初期値は端末の設定に従います。

## 機能

- ダッシュボード: 取得状態、総一致数、最新一致、保留中一致を表示し、手動確認を実行
- 設定画面: 話題 ID、有効状態、注記、取得間隔単位、投稿上限、並び順、UI 言語、
  ダークモード、テーマ色を設定
- アカウント設定: 登録、ログイン、ログアウト、ユーザー名更新、パスワード更新に対応；
  アカウントデータはユーザー ID ごとに分離
- キーワード規則: 共有規則、話題別規則、一致位置、大文字小文字の区別、正規表現に対応
- 設定 → 通知設定 → テスト通知
- 通知経路: カスタム Webhook、ServerChan、PushPlus、WxPusher、email API、SMTP
- 通知中継: PushPlus、WxPusher、ServerChan 用の任意 Cloudflare Worker 中継

## ローカル開発

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## デプロイ

本番環境では Oracle Cloud 上で Deno が動作し、Caddy が HTTPS を提供します。アカウント、セッション、記録は Turso に保存されます。リリースタグを付けると GitHub Actions が Windows と Android の配布ファイルを作成します。

[サーバー構築](./deployment.md) · [Cloudflare Worker](./worker.md)

## ライセンス

このプロジェクトは [GNU Affero General Public License v3.0](../../LICENSE) の下でライセンスされています。
