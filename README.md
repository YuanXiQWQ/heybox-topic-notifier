# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| **简体中文** | [English](#heybox-topic-notifier) |
|:------------:|:--------------------------------------:|

---

一个用于监控小黑盒话题帖子的轻量级 Deno 应用。它会按关键词检查帖子标题、正文、评论和回复，并为后续通知流程记录命中结果。

## 项目状态

项目仍处于早期 MVP 阶段。当前目标是先搭建一个可本地运行的管理后台，并通过模拟话题数据跑通设置、匹配、历史记录和手动检查流程。

真实小黑盒数据抓取和正式通知发送还没有接入；当前通知器仍是占位实现。

## 计划中的最小版本

- 仪表盘：查看轮询状态、累计命中数和最近一次命中
- 设置页：配置话题 ID、关键词、匹配位置、界面语言和通知方式
- 历史页：查看已命中的帖子记录
- 手动检查：本地调试时主动触发一次匹配流程
- 通知测试：为后续通知通道预留测试入口

## 技术栈

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron
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

如果需要覆盖默认配置，可以参考 `.env.example` 中的变量，在运行环境中设置对应的环境变量。

## 常用命令

```powershell
deno task dev
deno task start
deno task check
```

## 环境变量

| 变量 | 默认值 | 说明 |
|:-----|:-------|:-----|
| `APP_LOCALE` | `zh-CN` | 默认界面语言 |
| `HEYBOX_TOPIC_ID` | `12099` | 默认监控的话题 ID |
| `POLL_ENABLED` | `false` | 是否启用定时轮询 |
| `NOTIFIER_PROVIDER` | `webhook` | 预留通知通道配置 |
| `NOTIFIER_WEBHOOK_URL` | 空 | 预留 Webhook 地址 |
| `PORT` | `8000` | 本地服务端口 |

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE) 开源许可。

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

[中文](#小黑盒话题提醒) | **English**

---

A lightweight Deno app for monitoring posts in Heybox topics. It checks post titles, bodies, comments, and replies against keyword rules, then records matched results for the future notification workflow.

## Status

This project is still in the early MVP stage. The current goal is to provide a locally runnable management dashboard and use mock topic data to validate settings, matching, history, and manual polling.

Real Heybox data fetching and production notification delivery are not wired in yet. The notifier is currently a placeholder implementation.

## Planned MVP

- Dashboard: view poll status, total matches, and the latest match
- Settings page: configure topic ID, keywords, match locations, UI language, and notification provider
- History page: review matched post records
- Manual run: trigger one matching pass for local testing
- Notification test: keep a test entry point for future notification channels

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron
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

To override the defaults, use `.env.example` as a reference and set the corresponding environment variables in your runtime environment.

## Commands

```powershell
deno task dev
deno task start
deno task check
```

## Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| `APP_LOCALE` | `zh-CN` | Default UI language |
| `HEYBOX_TOPIC_ID` | `12099` | Default topic ID to monitor |
| `POLL_ENABLED` | `false` | Enables scheduled polling |
| `NOTIFIER_PROVIDER` | `webhook` | Reserved notification provider setting |
| `NOTIFIER_WEBHOOK_URL` | empty | Reserved webhook URL |
| `PORT` | `8000` | Local server port |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
