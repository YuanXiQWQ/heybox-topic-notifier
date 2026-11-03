# 小黑盒话题提醒

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

|                 **简体中文**                 | [正體中文（臺灣）](docs/zh-TW/README.md) |     [English](#heybox-topic-notifier)      |
| :------------------------------------------: | :--------------------------------------: | :----------------------------------------: |
|   [English (Canada)](docs/en-CA/README.md)   |   [English (UK)](docs/en-GB/README.md)   |       [日本語](docs/ja-JP/README.md)       |
|        [한국어](docs/ko-KR/README.md)        |     [Français](docs/fr-FR/README.md)     |      [Deutsch](docs/de-DE/README.md)       |
|       [Español](docs/es-ES/README.md)        |     [Italiano](docs/it-IT/README.md)     | [Português (Brasil)](docs/pt-BR/README.md) |
| [Português (Portugal)](docs/pt-PT/README.md) |     [Русский](docs/ru-RU/README.md)      |      [العربية](docs/ar-SA/README.md)       |
|        [हिन्दी](docs/hi-IN/README.md)         |       [বাংলা](docs/bn-BD/README.md)        |       [فارسی](docs/fa-IR/README.md)        |
|        [עברית](docs/he-IL/README.md)         |       [اردو](docs/ur-PK/README.md)       |     [Tiếng Việt](docs/vi-VN/README.md)     |
|         [ไทย](docs/th-TH/README.md)          | [Bahasa Indonesia](docs/id-ID/README.md) |       [Türkçe](docs/tr-TR/README.md)       |
|   [繁體中文（香港）](docs/zh-HK/README.md)   | [繁體中文（澳門）](docs/zh-MO/README.md) | [简体中文（新加坡）](docs/zh-SG/README.md) |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

在设置中添加要关注的小黑盒话题，选择关键词、正则、AI 匹配或规则筛选后 AI 复核，再开启轮询。命中帖子会进入工作区，处理后可移入历史，也可移回工作区。

新账号注册需要邀请码。应用通知按设备开启，可以和邮件或 Webhook 同时使用。离线时可编辑业务设置、整理已缓存的记录，联网后同步。语言和深色模式默认跟随系统，手动选择只保存在本机。

## 使用

- **登录与注册。** 已有账号可使用已绑定的密码、邮箱、Google 或 Passkey 登录。新用户向管理员获取邀请码。账号可以在设置页管理登录方式和两步验证。
- **工作区与历史。** 工作区显示待处理的帖子，可以手动检查新帖或批量完成。历史包含全部记录，已完成的帖子可以移回工作区。
- **匹配。** 公共规则和单话题规则可检查标题、正文、评论和回复。使用 AI 时可设置模型、提示词及用量限制。
- **通知。** 在“设置 → 通知设置”中打开当前设备的“应用通知”，或在“其它通知”中选择 Webhook 或邮件。两项可以同时开启。点击卡片底部的“测试通知”检查已开启的通道，测试不会新增工作区记录。
- **安装与更新。** 网页“设置 → 关于项目”提供下载安装入口。客户端启动时检查更新，也可点击版本号旁的“检查更新”。Android 支持无 GMS 设备。详见[Windows 与 Android 应用](apps/README.md)。

## 本地开发

安装 Deno 2，需要自定义本地配置时将 [`.env.example`](.env.example) 复制为 `.env` 并编辑。开发入口默认可用本地 KV；正式站使用 Turso。

```sh
deno task dev
```

打开 [localhost:8000](http://localhost:8000) 访问开发服务。运行 `deno task check` 执行检查与测试。

## 部署

正式站运行在 Oracle Cloud 虚拟机上。Caddy 提供 HTTPS，Deno 常驻进程负责抓帖和通知，Turso 保存账号、会话和业务记录。正式标签触发 GitHub Actions 构建 Windows 安装包和 Android APK。

[自托管部署](docs/zh-CN/deployment.md) · [Cloudflare Worker](docs/zh-CN/worker.md)

## 许可证

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。

---

---

# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](#小黑盒话题提醒) | **English** |
| :-------------------------: | :---------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Choose a Heybox topic, set keyword or regular expression rules, or enable AI matching. Turn on polling in Settings. Matches appear in the workspace and can be moved to history and restored.

New accounts need an invitation code. App notifications are enabled per device and can be used alongside email or a webhook. Cached edits sync when you reconnect. Language and dark mode follow the device until you change them locally.

## Using the app

- **Sign in.** Use a password, email, Google or a passkey already linked to your account. Ask an administrator for an invitation code to register. Manage sign-in methods and two-step verification in Settings.
- **Review matches.** The workspace shows posts awaiting review. Check for new posts manually or mark several as complete. History includes all records and lets you restore completed posts to the workspace.
- **Choose what to match.** Shared and per-topic rules can check titles, bodies, comments and replies. AI matching supports a model, prompt and usage limit. Hybrid mode checks rules before requesting AI review.
- **Test notifications.** In Settings, enable app notifications on this device and optionally choose email or a webhook. The test at the bottom of the notification card tries the enabled channels without adding a post to the workspace.
- **Install and update.** Open About the project in Settings to download an installer. Clients check for updates on startup. You can also check from the version shown on the About page. The Android app runs on devices without Google Play Services.

## Local Development

Install Deno 2. To configure a local instance, copy [`.env.example`](.env.example) to `.env` and edit it. The development entry point can use local KV. Production uses Turso.

```sh
deno task dev
```

Open [localhost:8000](http://localhost:8000) to use the development server. Run `deno task check` for checks and tests.

## Deployment

Oracle Cloud runs the Deno service behind Caddy. Turso stores accounts, sessions and matches. GitHub Actions builds the Windows and Android installers for release tags.

[Self-hosting](docs/en/deployment.md) · [Cloudflare Worker](docs/en/worker.md)

## License

This project is licensed under the
[GNU Affero General Public License v3.0](LICENSE).
