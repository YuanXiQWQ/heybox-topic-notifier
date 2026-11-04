# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **English (Canada)** |
| :-------------------------: | :------------------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Choose a Heybox topic, set keyword or regular expression rules, or enable AI matching. Turn on polling in Settings. Matches appear in the workspace and can be moved to history and restored.

New accounts need an invitation code. App notifications are enabled per device and can be used alongside email or a webhook. Cached edits sync when you reconnect. Language and dark mode follow the device until you change them locally.

## Features

- Dashboard: view poll status, total matches, the latest match, and pending matches, with a manual
  check action
- Settings page: configure topic IDs, enabled state, notes, polling interval unit, post limit, sort
  mode, UI language, dark mode, and theme colour
- Account settings: register, log in, log out, update username, and update password; account data is
  isolated by user ID
- Keyword rules: support shared rules, topic-specific rules, match locations, case sensitivity, and
  regular expressions
- Settings → Notification settings → Test notify
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API, and SMTP
- Notification relay: optional Cloudflare Worker relay for PushPlus, WxPusher, and ServerChan

## Local Development

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Oracle Cloud runs the Deno service behind Caddy. Turso stores accounts, sessions and matches. GitHub Actions builds the Windows and Android installers for release tags.

[Self-hosting](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licence

This project is licensed under the [GNU Affero General Public Licence v3.0](../../LICENSE).
