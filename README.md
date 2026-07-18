# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

|                   **简体中文**                   |     [正體中文（臺灣）](docs/zh-TW/README.md)     |     [English](#heybox-topic-notifier)      |
|:--------------------------------------------:|:----------------------------------------:|:------------------------------------------:|
|   [English (Canada)](docs/en-CA/README.md)   |   [English (UK)](docs/en-GB/README.md)   |        [日本語](docs/ja-JP/README.md)         |
|         [한국어](docs/ko-KR/README.md)          |     [Français](docs/fr-FR/README.md)     |      [Deutsch](docs/de-DE/README.md)       |
|       [Español](docs/es-ES/README.md)        |     [Italiano](docs/it-IT/README.md)     | [Português (Brasil)](docs/pt-BR/README.md) |
| [Português (Portugal)](docs/pt-PT/README.md) |     [Русский](docs/ru-RU/README.md)      |      [العربية](docs/ar-SA/README.md)       |
|        [हिन्दी](docs/hi-IN/README.md)        |      [বাংলা](docs/bn-BD/README.md)       |       [فارسی](docs/fa-IR/README.md)        |
|        [עברית](docs/he-IL/README.md)         |       [اردو](docs/ur-PK/README.md)       |     [Tiếng Việt](docs/vi-VN/README.md)     |
|         [ไทย](docs/th-TH/README.md)          | [Bahasa Indonesia](docs/id-ID/README.md) |       [Türkçe](docs/tr-TR/README.md)       |
|       [繁體中文（香港）](docs/zh-HK/README.md)       |     [繁體中文（澳門）](docs/zh-MO/README.md)     |     [简体中文（新加坡）](docs/zh-SG/README.md)      |

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> 小黑盒话题提醒</a>
是一个用于监控小黑盒话题帖子的轻量级 Deno 应用。它会按账号设置定时读取真实话题帖子，
按关键词规则检查标题、正文、评论和回复，把命中结果记录到待处理列表与历史记录中，并按配置发送通知。

## 功能

- 仪表盘：查看轮询状态、累计命中数、最近一次命中和待处理命中，并可手动触发检查
- 设置页：配置话题编号、启用状态、话题备注、轮询间隔单位、抓取数量、排序方式、界面语言、深色模式和主题色
- 账号设置：支持注册、登录、退出、修改用户名和修改密码；账号数据按用户 ID 隔离
- 关键词规则：支持公共规则、单话题规则、匹配位置、大小写匹配和正则匹配
- 命中表格：待处理和历史记录都支持时间范围筛选、分页、批量完成或删除
- 调试入口：支持模拟命中和通知测试，并对手动轮询与调试操作做频率限制
- 通知通道：支持自定义 Webhook、Server酱、PushPlus、WxPusher、邮件 API 和 SMTP
- 通知中转：可使用仓库内的 Cloudflare Worker 中转 PushPlus、WxPusher 和 Server酱
- 安全防护：包含 PBKDF2 密码哈希、KV 会话、CSRF token、安全响应头、审计日志和出站目标 allowlist/DNS
  校验

## 技术栈

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + 本地定时器调度
- 服务端渲染 HTML + 原生 JavaScript/CSS
- Cloudflare Workers 通知中转脚本

## 本地开发

运行开发服务器：

```powershell
deno task dev
```

然后访问：

```text
http://localhost:8000
```

如果需要覆盖默认配置，可以参考 `.env.example` 并在运行环境中设置对应环境变量。首次访问时先注册账号；
环境变量只提供新账号或默认数据的初始值，之后以各账号设置页保存的配置为准。

应用提供注册和登录页面。每个账号拥有独立的设置、命中记录、轮询状态和通知配置；公开同一个部署链接时，
不同用户的数据互不共享。用户密码以加盐 PBKDF2 哈希保存到 Deno KV，不保存明文密码；登录会话也存储在
Deno KV，浏览器 Cookie 里只保存随机 session token。修改设置、账号和调试操作时会校验 CSRF token，
并对公开部署下的敏感操作做服务端频率限制。

## 常用命令

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` 会清空已处理帖子标记，用于重新验证同一批帖子；生产环境中请谨慎运行。

## 部署

Deno Deploy 配置见 [docs/zh-CN/deployment.md](docs/zh-CN/deployment.md)。仓库通过 `deno.json` 的
`deploy` 配置指定入口；GitHub Actions 只负责运行检查，不负责部署应用。部署入口在 `src/deploy.ts`
中声明部署 Cron，实际轮询只在 Production 和 `dev` Git Branch timeline 上执行。通知中转 Worker
的部署说明见 [docs/zh-CN/worker.md](docs/zh-CN/worker.md)。

## 许可证

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](#小黑盒话题提醒) | **English** |
|:----------------:|:-----------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
is a lightweight Deno app for monitoring Heybox topic posts. It periodically reads real topic posts
according to each account's settings, checks titles, bodies, comments, and replies against keyword
rules, records matches in pending and history views, and sends notifications through the configured
channel.

## Features

- Dashboard: view poll status, total matches, the latest match, and pending matches, with a manual
  check action
- Settings page: configure topic IDs, enabled state, notes, polling interval unit, post limit, sort
  mode, UI language, dark mode, and theme color
- Account settings: register, log in, log out, update username, and update password; account data is
  isolated by user ID
- Keyword rules: support shared rules, topic-specific rules, match locations, case sensitivity, and
  regular expressions
- Match tables: pending and history records both support time-range filters, pagination,
  batch-complete, and delete actions
- Debug entries: simulated matches and notification tests, with server-side rate limits for manual
  polling and debug operations
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API, and SMTP
- Notification relay: optional Cloudflare Worker relay for PushPlus, WxPusher, and ServerChan
- Security: PBKDF2 password hashes, KV-backed sessions, CSRF tokens, security headers, audit logs,
  and outbound allowlist/DNS validation

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + local timer scheduler
- Server-rendered HTML + vanilla JavaScript/CSS
- Cloudflare Workers notification relay script

## Local Development

Start the development server:

```powershell
deno task dev
```

Then open:

```text
http://localhost:8000
```

To override the defaults, use `.env.example` as a reference and set the corresponding environment
variables in your runtime environment. Register an account on first visit; environment variables
only seed defaults for new accounts or default data, and each account's settings page becomes the
source of truth after that.

The app provides registration and login pages. Each account has isolated settings, match history,
polling state, and notification configuration, so users sharing the same deployment URL do not share
data. User passwords are stored in Deno KV as salted PBKDF2 hashes, not plaintext. Login sessions
are stored in Deno KV, and the browser cookie only contains a random session token. Settings,
account, and debug mutations validate a CSRF token, and sensitive operations are rate-limited on
public deployments.

## Commands

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` clears processed-post markers so the same posts can be verified again; use it with care
in production.

## Deployment

See [docs/en/deployment.md](docs/en/deployment.md) for Deno Deploy setup. The app entrypoint is
defined by the `deploy` section in `deno.json`; GitHub Actions only runs checks and does not deploy
the app. The deploy entrypoint in `src/deploy.ts` declares the Deno Deploy Cron, and actual polling
only runs on Production and the `dev` Git Branch timeline. See
[docs/en/worker.md](docs/en/worker.md) for the notification relay Worker setup.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
