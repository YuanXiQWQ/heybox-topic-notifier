# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| **简体中文** | [English](#heybox-topic-notifier) |
| :----------: | :-------------------------------: |

---

[小黑盒话题提醒](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)
是一个用于监控小黑盒话题帖子的轻量级 Deno
应用。它会按关键词检查帖子标题、正文、评论和回复，并记录命中结果，供后续通知流程使用。

## 项目状态

项目仍处于 MVP 阶段。当前主线是：

- 使用 Deno + Hono 提供管理后台
- 直连小黑盒 App 发布时间接口获取真实帖子
- 后续继续完善网页体验、通知通道和部署配置

## 功能

- 仪表盘：查看轮询状态、累计命中数和最近一次命中
- 设置页：配置话题 ID、关键词、匹配位置、界面语言和通知方式
- 历史页：查看已命中的帖子记录
- 手动检查：本地调试时主动触发一次匹配流程
- 通知测试：为通知通道保留测试入口

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

如果需要覆盖默认配置，可以参考 `.env.example` 并在运行环境中设置对应环境变量。

## 常用命令

```powershell
deno task dev
deno task start
deno task check
```

## 环境变量

| 变量                    | 默认值        | 说明                                                                   |
| :---------------------- | :------------ | :--------------------------------------------------------------------- |
| `APP_LOCALE`            | `zh-CN`       | 默认界面语言                                                           |
| `HEYBOX_TOPIC_ID`       | `12099`       | 默认监控的话题 ID                                                      |
| `HEYBOX_DEVICE_ID`      | 空            | 小黑盒 App API 设备标识，留空则启动时生成                              |
| `HEYBOX_COOKIE`         | 空            | 预留小黑盒 Cookie，公开话题发布时间列表通常不需要                      |
| `HEYBOX_USER_AGENT`     | 空            | 覆盖小黑盒请求 User-Agent                                              |
| `HEYBOX_SIGNATURE_MODE` | `app`         | 小黑盒签名模式，`app` 为已验证的发布时间接口模式，`web` 仅保留诊断用途 |
| `HEYBOX_POST_LIMIT`     | `20`          | 每次轮询读取的帖子数量                                                 |
| `HEYBOX_SORT_FILTER`    | 空            | 兼容旧配置；`create` 等价于发布时间，`hot-rank` 等价于智能排序         |
| `POLL_ENABLED`          | `false`       | 是否启用定时轮询                                                       |
| `POLL_INTERVAL_MINUTES` | `1`           | 定时轮询间隔                                                           |
| `POLL_POST_LIMIT`       | `20`          | 每次轮询读取的帖子数量                                                 |
| `POLL_SORT`             | `publishTime` | 轮询排序方式，支持 `publishTime`、`smart`、`replyTime`                 |
| `NOTIFIER_PROVIDER`     | `webhook`     | 预留通知通道配置                                                       |
| `NOTIFIER_WEBHOOK_URL`  | 空            | 预留 Webhook 地址                                                      |
| `PORT`                  | `8000`        | 本地服务端口                                                           |

## 许可证

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](#小黑盒话题提醒) | **English** |
| :-------------------------: | :---------: |

---

[Heybox Topic Notifier](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/) is a lightweight
Deno app for monitoring Heybox topic posts. It checks post titles, bodies, comments, and replies
against keyword rules, then records matched results for the notification workflow.

## Status

This project is still in the MVP stage. The current direction is:

- Provide a management dashboard with Deno + Hono
- Fetch real posts directly from the Heybox App publish-time topic API
- Continue improving the web experience, notification channels, and deployment configuration

## Features

- Dashboard: view poll status, total matches, and the latest match
- Settings page: configure topic ID, keywords, match locations, UI language, and notification
  provider
- History page: review matched post records
- Manual run: trigger one matching pass during local debugging
- Notification test: keep a test entry point for notification channels

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

| Variable                | Default       | Description                                                                                      |
| :---------------------- | :------------ | :----------------------------------------------------------------------------------------------- |
| `APP_LOCALE`            | `zh-CN`       | Default UI language                                                                              |
| `HEYBOX_TOPIC_ID`       | `12099`       | Default topic ID to monitor                                                                      |
| `HEYBOX_DEVICE_ID`      | empty         | Heybox App API device ID, generated on startup when empty                                        |
| `HEYBOX_COOKIE`         | empty         | Reserved Heybox cookie, usually not needed for public publish-time feeds                         |
| `HEYBOX_USER_AGENT`     | empty         | Overrides the Heybox request User-Agent                                                          |
| `HEYBOX_SIGNATURE_MODE` | `app`         | Heybox signing mode; `app` is verified for publish-time feeds, `web` is diagnostic fallback only |
| `HEYBOX_POST_LIMIT`     | `20`          | Number of posts to read per poll                                                                 |
| `HEYBOX_SORT_FILTER`    | empty         | Legacy-compatible sort setting; `create` maps to publish time, `hot-rank` maps to smart sort     |
| `POLL_ENABLED`          | `false`       | Enables scheduled polling                                                                        |
| `POLL_INTERVAL_MINUTES` | `1`           | Scheduled polling interval                                                                       |
| `POLL_POST_LIMIT`       | `20`          | Number of posts to read per poll                                                                 |
| `POLL_SORT`             | `publishTime` | Polling sort, supports `publishTime`, `smart`, and `replyTime`                                   |
| `NOTIFIER_PROVIDER`     | `webhook`     | Reserved notification provider setting                                                           |
| `NOTIFIER_WEBHOOK_URL`  | empty         | Reserved webhook URL                                                                             |
| `PORT`                  | `8000`        | Local server port                                                                                |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
