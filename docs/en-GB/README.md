# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **English (United Kingdom)** |
|:-----------------------:|:----------------------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
is a lightweight Deno app for monitoring Heybox topic posts. It periodically reads real topic posts
according to each account’s settings, check titles, bodies, comments, and replies against the keyword
rules, records matches in pending and history views, and sends notifications through the configured
channel.

## Features

- Dashboard: view poll status, total matches, the latest match, and pending matches, with a manual
  check action
- Settings page: configure topic IDs, enabled state, notes, polling interval unit, post limit, sort
  mode, UI language, dark mode, and theme colour
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

See [deployment](./deployment.md) for the Deno Deploy setup. The app entrypoint is
defined by the `deploy` section in `deno.json`; GitHub Actions only runs checks and does not deploy
the app. The deploy entrypoint in `src/deploy.ts` declares the Deno Deploy Cron, and actual polling
only runs on Production and the `dev` Git Branch timeline. See
[worker](./worker.md) for the notification relay Worker setup.

## Licence

This project is licensed under the [GNU Affero General Public Licence v3.0](../../LICENSE).