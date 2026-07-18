# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| **简体中文** | [English](#heybox-topic-notifier) |
|:--------:|:---------------------------------:|

---

[小黑盒话题提醒](https://heybox-topic-notifier.yuanxiqwq.deno.net/)（[dev](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)）
是一个用于监控小黑盒话题帖子的轻量级 Deno 应用。它会定时读取真实话题帖子，
按关键词规则检查标题、正文、评论和回复，并把命中结果记录到待处理列表与历史记录中。

## 项目状态

项目仍处于 MVP 阶段，但已经从早期占位数据切换到真实话题源。当前已具备：

- 使用 Deno + Hono 提供管理后台
- 读取真实话题帖子，并支持按发布时间、智能排序或回复时间轮询
- 配置多个话题、公共关键词规则和单话题关键词规则
- 记录待处理命中、历史命中和轮询状态
- 通过 Webhook、Server酱、PushPlus、WxPusher、邮件 API 或 SMTP 发送通知

后续重点是部署配置、通知内容体验和更多稳定性验证。

## 功能

- 仪表盘：查看轮询状态、累计命中数、最近一次命中和待处理命中
- 设置页：配置话题 ID、话题备注、轮询间隔、排序方式、界面语言和主题色
- 关键词规则：支持公共规则、单话题规则、匹配位置、大小写匹配和正则匹配
- 历史页：查看已命中的帖子记录，并支持批量完成或删除记录
- 调试入口：手动检查、模拟命中和通知测试
- 通知通道：支持自定义 Webhook、Server酱、PushPlus、WxPusher、邮件 API 和 SMTP

## 技术栈

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno timer scheduler
- 服务端渲染 HTML

## 本地开发

运行开发服务器：

```powershell
deno task dev
```

然后访问：

```text
http://localhost:8000
```

如果需要覆盖默认配置，可以参考 `.env.example` 并在运行环境中设置对应环境变量。

应用提供注册和登录页面。每个账号拥有独立的设置、命中记录、轮询状态和通知配置；公开同一个部署链接时，
不同用户的数据互不共享。用户密码以加盐 PBKDF2 哈希保存到 Deno KV，不保存明文密码；登录会话也存储在
Deno KV，浏览器 Cookie 里只保存随机 session token。

## 常用命令

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` 会清空已处理帖子标记，用于重新验证同一批帖子；生产环境中请谨慎运行。

## 部署

Deno Deploy 配置见 [docs/deployment.md](docs/deployment.md)。仓库通过 `deno.json` 的 `deploy`
配置指定入口；GitHub Actions 只负责运行检查，不负责部署应用。

## 许可证

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](#小黑盒话题提醒) | **English** |
|:----------------:|:-----------:|

---

[Heybox Topic Notifier](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)
([dev](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)) is a lightweight Deno app for
monitoring Heybox topic posts. It periodically reads real topic posts, checks titles, bodies,
comments, and replies against keyword rules, then records matches in pending and history views.

## Status

This project is still in the MVP stage, but it has moved from placeholder data to a real topic
source. It currently provides:

- Provide a management dashboard with Deno + Hono
- Read real topic posts and poll by publish time, smart sort, or reply time
- Configure multiple topics, shared keyword rules, and topic-specific keyword rules
- Record pending matches, historical matches, and polling state
- Send notifications through Webhook, ServerChan, PushPlus, WxPusher, email API, or SMTP

The next focus is deployment configuration, notification content quality, and more stability
verification.

## Features

- Dashboard: view poll status, total matches, the latest match, and pending matches
- Settings page: configure topic IDs, notes, polling interval, sort mode, UI language, and theme
  color
- Keyword rules: support shared rules, topic-specific rules, match locations, case sensitivity, and
  regular expressions
- History page: review matched post records and batch-complete or delete records
- Debug entries: manual run, simulated match, and notification test
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API, and SMTP

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno timer scheduler
- Server-rendered HTML

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
variables in your runtime environment.

The app provides registration and login pages. Each account has isolated settings, match history,
polling state, and notification configuration, so users sharing the same deployment URL do not share
data. User passwords are stored in Deno KV as salted PBKDF2 hashes, not plaintext. Login sessions
are stored in Deno KV, and the browser cookie only contains a random session token.

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

See [docs/deployment.md](docs/deployment.md) for Deno Deploy setup. The app entrypoint is defined by
the `deploy` section in `deno.json`; GitHub Actions only runs checks and does not deploy the app.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
