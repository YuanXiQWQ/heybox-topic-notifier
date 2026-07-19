# 小黑盒話題提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **繁體中文（香港）** |
|:-----------------------:|:------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> 小黑盒話題提醒</a>
是一個用於監控小黑盒話題帖子的輕量級 Deno 應用程式。它會按帳戶設定定時讀取真實話題帖子，
按關鍵字規則檢查標題、正文、評論和回覆，把命中結果記錄到待處理列表與歷史記錄中，並按配置發送通知。

## 功能

- 儀錶板：查看輪詢狀態、累計命中數、最近一次命中和待處理命中，並可手動觸發檢查
- 設定頁：配置話題編號、啟用狀態、話題備註、輪詢間隔單位、擷取數量、排序方式、介面語言、深色模式和主題色
- 帳戶設定：支援註冊、登入、登出、修改使用者名稱和修改密碼；帳戶資料按使用者 ID 隔離
- 關鍵字規則：支援公共規則、單話題規則、匹配位置、大小寫匹配和正則匹配
- 命中表格：待處理和歷史記錄都支援時間範圍篩選、分頁、批量完成或刪除
- 偵錯入口：支援模擬命中和通知測試，並對手動輪詢與偵錯操作作頻率限制
- 通知通道：支援自訂 Webhook、Server醬、PushPlus、WxPusher、郵件 API 和 SMTP
- 通知中轉：可使用倉庫內的 Cloudflare Worker 中轉 PushPlus、WxPusher 和 Server醬
- 安全防護：包含 PBKDF2 密碼雜湊、KV 會話、CSRF token、安全回應標頭、審計日誌和出站目標 allowlist/DNS
  校驗

## 技術棧

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + 本地定時器調度
- 伺服器端渲染 HTML + 原生 JavaScript/CSS
- Cloudflare Workers 通知中轉腳本

## 本地開發

運行開發伺服器：

```powershell
deno task dev
```

然後訪問：

```text
http://localhost:8000
```

如果需要覆蓋預設配置，可以參考 `.env.example` 並在運行環境中設定對應環境變數。首次訪問時先註冊帳戶；
環境變數只提供新帳戶或預設資料的初始值，之後以各帳戶設定頁儲存的配置為準。

應用程式提供註冊和登入頁面。每個帳戶擁有獨立的設定、命中記錄、輪詢狀態和通知配置；公開同一個部署連結時，
不同使用者的資料互不共享。使用者密碼以加鹽 PBKDF2 雜湊儲存到 Deno KV，不儲存明文密碼；登入會話也儲存在
Deno KV，瀏覽器 Cookie 內只儲存隨機 session token。修改設定、帳戶和偵錯操作時會校驗 CSRF token，
並對公開部署下的敏感操作作伺服器端頻率限制。

## 常用指令

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` 會清空已處理帖子標記，用於重新驗證同一批帖子；生產環境中請謹慎運行。

## 部署

Deno Deploy 配置見 [deployment](./deployment.md)。倉庫通過 `deno.json` 的 `deploy` 配置指定入口；
GitHub Actions 只負責運行檢查，不負責部署應用程式。部署入口在 `src/deploy.ts` 中聲明部署 Cron，
實際輪詢只在 Production 和 `dev` Git Branch timeline 上執行。通知中轉 Worker 的部署說明見
[worker](./worker.md)。

## 許可證

本項目使用 [GNU Affero General Public License v3.0](../../LICENSE)。