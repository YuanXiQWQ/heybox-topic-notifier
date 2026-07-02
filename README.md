# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| **简体中文** | [English](#heybox-topic-notifier) |
| :----------: | :-------------------------------: |

---

一个用于监控小黑盒话题帖子的轻量级 Deno
应用。它会按关键词检查帖子标题、正文、评论和回复，并为后续通知流程记录命中结果。

## 项目状态

项目仍处于早期 MVP
阶段。当前目标是先搭建一个可本地运行的管理后台，并通过模拟话题数据跑通设置、匹配、历史记录和手动检查流程。

真实小黑盒话题抓取已经可以通过环境变量启用；当前通知器仍是占位实现。

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

| 变量                   | 默认值    | 说明                                                     |
| :--------------------- | :-------- | :------------------------------------------------------- |
| `APP_LOCALE`           | `zh-CN`   | 默认界面语言                                             |
| `HEYBOX_TOPIC_ID`      | `12099`   | 默认监控的话题 ID                                        |
| `TOPIC_SOURCE`         | `mock`    | 话题数据源，`mock`、`heybox`、`heybox-hblog` 或 `worker` |
| `TOPIC_WORKER_URL`     | 空        | 预留云端 feed worker 地址，`TOPIC_SOURCE=worker` 时必填  |
| `TOPIC_WORKER_TOKEN`   | 空        | 预留云端 feed worker Bearer token                        |
| `HEYBOX_HBLOG_NET_LOG` | 空        | 本地开发验证用的小黑盒 hblog net 日志路径                |
| `HEYBOX_DEVICE_ID`     | 空        | 小黑盒网页请求设备标识，留空则启动时生成                 |
| `HEYBOX_COOKIE`        | 空        | 预留小黑盒 Cookie，公开话题首屏通常不需要                |
| `HEYBOX_USER_AGENT`    | 空        | 覆盖小黑盒请求 User-Agent                                |
| `HEYBOX_POST_LIMIT`    | `20`      | 每次轮询读取的帖子数量                                   |
| `HEYBOX_SORT_FILTER`   | 空        | 预留小黑盒排序参数，留空时跟随网页首屏                   |
| `POLL_ENABLED`         | `false`   | 是否启用定时轮询                                         |
| `NOTIFIER_PROVIDER`    | `webhook` | 预留通知通道配置                                         |
| `NOTIFIER_WEBHOOK_URL` | 空        | 预留 Webhook 地址                                        |
| `PORT`                 | `8000`    | 本地服务端口                                             |

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE) 开源许可。

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

[中文](#小黑盒话题提醒) | **English**

---

A lightweight Deno app for monitoring posts in Heybox topics. It checks post titles, bodies,
comments, and replies against keyword rules, then records matched results for the future
notification workflow.

## Status

This project is still in the early MVP stage. The current goal is to provide a locally runnable
management dashboard and use mock topic data to validate settings, matching, history, and manual
polling.

Real Heybox topic fetching can now be enabled through environment variables. The notifier is still a
placeholder implementation.

## Planned MVP

- Dashboard: view poll status, total matches, and the latest match
- Settings page: configure topic ID, keywords, match locations, UI language, and notification
  provider
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

To override the defaults, use `.env.example` as a reference and set the corresponding environment
variables in your runtime environment.

## Commands

```powershell
deno task dev
deno task start
deno task check
```

## Environment Variables

| Variable               | Default   | Description                                                           |
| :--------------------- | :-------- | :-------------------------------------------------------------------- |
| `APP_LOCALE`           | `zh-CN`   | Default UI language                                                   |
| `HEYBOX_TOPIC_ID`      | `12099`   | Default topic ID to monitor                                           |
| `TOPIC_SOURCE`         | `mock`    | Topic source: `mock`, `heybox`, `heybox-hblog`, or `worker`           |
| `TOPIC_WORKER_URL`     | empty     | Reserved cloud feed worker URL, required when `TOPIC_SOURCE=worker`   |
| `TOPIC_WORKER_TOKEN`   | empty     | Reserved cloud feed worker Bearer token                               |
| `HEYBOX_HBLOG_NET_LOG` | empty     | Local development hblog net log path                                  |
| `HEYBOX_DEVICE_ID`     | empty     | Heybox web device ID, generated on startup when empty                 |
| `HEYBOX_COOKIE`        | empty     | Reserved Heybox cookie, usually not needed for public topic feeds     |
| `HEYBOX_USER_AGENT`    | empty     | Overrides the Heybox request User-Agent                               |
| `HEYBOX_POST_LIMIT`    | `20`      | Number of posts to read per poll                                      |
| `HEYBOX_SORT_FILTER`   | empty     | Reserved Heybox sort filter; empty follows the first web page request |
| `POLL_ENABLED`         | `false`   | Enables scheduled polling                                             |
| `NOTIFIER_PROVIDER`    | `webhook` | Reserved notification provider setting                                |
| `NOTIFIER_WEBHOOK_URL` | empty     | Reserved webhook URL                                                  |
| `PORT`                 | `8000`    | Local server port                                                     |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
