# Heybox Topic Notifier / 小黑盒话题提醒

A lightweight Deno app for monitoring Heybox topic posts and sending keyword-based notifications.

轻量级 Deno 应用：监控小黑盒话题帖子，并按关键词发送通知。

## Status / 状态

This project is in the early MVP stage. The first milestone is a local, bilingual management
dashboard backed by mock topic data.

项目仍处于早期 MVP
阶段。第一阶段目标是搭建一个本地可运行、支持中英文的管理后台，并先使用模拟话题数据跑通流程。

## Stack / 技术栈

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron
- Server-rendered HTML / 服务端渲染 HTML

## Planned MVP / 计划中的最小版本

- Dashboard for poll status and recent matches / 展示轮询状态和最近命中的仪表盘
- Settings for topic, keywords, locale, and notification channel / 配置话题、关键词、语言和通知方式
- History page for matched posts / 查看命中帖子历史
- Manual run endpoint for local testing / 手动触发检查，方便本地测试
- Notification test endpoint / 测试通知通道

## Local Development / 本地开发

```powershell
deno task dev
```

Then open / 然后访问：

```text
http://localhost:8000
```

## Environment / 环境变量

Copy `.env.example` and configure secrets outside Git.

复制 `.env.example`，并在 Git 之外配置真实密钥。

## License / 许可证

AGPL-3.0-or-later
