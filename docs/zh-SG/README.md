# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **简体中文（新加坡）** |
| :-------------------------: | :--------------------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

在设置中添加要关注的小黑盒话题，选择关键词、正则、AI 匹配或规则筛选后 AI 复核，再开启轮询。命中帖子会进入工作区，处理后可移入历史，也可移回工作区。

新账号注册需要邀请码。应用通知按设备开启，可以和邮件或 Webhook 同时使用。离线时可编辑业务设置、整理已缓存的记录，联网后同步。语言和深色模式默认跟随系统，手动选择只保存在本机。

## 功能

- 仪表盘：查看轮询状态、累计命中数、最近一次命中和待处理命中，并可手动触发检查
- 设置页：配置话题编号、启用状态、话题备注、轮询间隔单位、抓取数量、排序方式、界面语言、深色模式和主题色
- 账号设置：支持注册、登录、退出、修改用户名和修改密码；账号数据按用户 ID 隔离
- 关键词规则：支持公共规则、单话题规则、匹配位置、大小写匹配和正则匹配
- 设置 → 通知设置 → 测试通知
- 通知通道：支持自定义 Webhook、Server酱、PushPlus、WxPusher、邮件 API 和 SMTP
- 通知中转：可使用仓库内的 Cloudflare Worker 中转 PushPlus、WxPusher 和 Server酱

## 本地开发

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## 部署

正式站运行在 Oracle Cloud 虚拟机上。Caddy 提供 HTTPS，Deno 常驻进程负责抓帖和通知，Turso 保存账号、会话和业务记录。正式标签触发 GitHub Actions 构建 Windows 安装包和 Android APK。

[自托管部署](./deployment.md) · [Cloudflare Worker](./worker.md)

## 许可证

本项目使用 [GNU Affero General Public License v3.0](../../LICENSE)。
