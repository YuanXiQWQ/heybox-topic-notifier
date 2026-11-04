# 小黑盒話題提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **正體中文（臺灣）** |
| :-------------------------: | :------------------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

在設定中新增要追蹤的小黑盒話題，選擇關鍵字、正規表示式或 AI 比對，再啟用輪詢。符合條件的貼文會出現在工作區，處理後可移至歷史紀錄，也可移回工作區。

註冊新帳號需要邀請碼。每部裝置可分別開啟應用程式通知，並搭配電子郵件或 Webhook。離線編輯會在恢復連線後同步。語言和深色模式預設跟隨系統，手動選擇只儲存在本機。

## 功能

- 儀錶板：查看輪詢狀態、累計命中數、最近一次命中和待處理命中，並可手動觸發檢查
- 設定頁：設定話題編號、啟用狀態、話題備註、輪詢間隔單位、抓取數量、排序方式、介面語言、深色模式和主題色
- 帳號設定：支援註冊、登入、登出、修改使用者名稱和修改密碼；帳號資料依使用者 ID 隔離
- 關鍵字規則：支援公共規則、單話題規則、比對位置、大小寫比對和正規表示式比對
- 設定 → 通知設定 → 測試通知
- 通知通道：支援自訂 Webhook、Server醬、PushPlus、WxPusher、郵件 API 和 SMTP
- 通知中繼：可使用儲存庫內的 Cloudflare Worker 中繼 PushPlus、WxPusher 和 Server醬

## 本機開發

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## 部署

正式服務在 Oracle Cloud 虛擬機器上執行。Caddy 提供 HTTPS，Deno 程序負責輪詢與通知，Turso 儲存帳號、工作階段及紀錄。發行標籤會觸發 GitHub Actions 建置 Windows 與 Android 安裝檔。

[自行架設](./deployment.md) · [Cloudflare Worker](./worker.md)

## 授權條款

本專案使用 [GNU Affero General Public License v3.0](../../LICENSE)。
