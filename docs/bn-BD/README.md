# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **বাংলা** |
|:-----------------------:|:---------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
Heybox topic পোস্ট পর্যবেক্ষণের জন্য একটি হালকা Deno অ্যাপ। এটি প্রতিটি অ্যাকাউন্টের সেটিংস অনুযায়ী
নিয়মিতভাবে বাস্তব topic পোস্ট পড়ে, শিরোনাম, মূল লেখা, মন্তব্য এবং reply-গুলো keyword rule-এর সঙ্গে
মিলিয়ে দেখে, pending ও history view-তে match রেকর্ড করে, এবং কনফিগার করা channel দিয়ে notification পাঠায়।

## বৈশিষ্ট্য

- Dashboard: poll status, মোট match, সর্বশেষ match এবং pending match দেখা যায়, সঙ্গে manual
  check action
- Settings page: topic ID, enabled state, note, polling interval unit, post limit, sort mode,
  UI language, dark mode এবং theme color কনফিগার করা যায়
- Account settings: register, log in, log out, username update এবং password update; account data
  user ID অনুযায়ী আলাদা রাখা হয়
- Keyword rules: shared rule, topic-specific rule, match location, case sensitivity এবং regular
  expression সমর্থন করে
- Match tables: pending ও history record—দুটিই time-range filter, pagination, batch-complete এবং
  delete action সমর্থন করে
- Debug entries: simulated match এবং notification test, manual polling ও debug operation-এর জন্য
  server-side rate limit সহ
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API এবং SMTP
- Notification relay: PushPlus, WxPusher এবং ServerChan-এর জন্য optional Cloudflare Worker relay
- Security: PBKDF2 password hash, KV-backed session, CSRF token, security header, audit log,
  outbound allowlist এবং DNS validation

## প্রযুক্তি স্ট্যাক

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + local timer scheduler
- Server-rendered HTML + vanilla JavaScript/CSS
- Cloudflare Workers notification relay script

## Local Development

Development server চালু করুন:

```powershell
deno task dev
```

তারপর খুলুন:

```text
http://localhost:8000
```

Default মানগুলো override করতে `.env.example`-কে reference হিসেবে ব্যবহার করুন এবং আপনার runtime
environment-এ সংশ্লিষ্ট environment variable সেট করুন। প্রথমবার ভিজিট করার সময় একটি account register
করুন; environment variable শুধু নতুন account বা default data-এর জন্য default value seed করে, এরপর
প্রতিটি account-এর settings page-ই source of truth হয়ে যায়।

অ্যাপটি registration এবং login page প্রদান করে। প্রতিটি account-এর settings, match history, polling state
এবং notification configuration আলাদা থাকে, তাই একই deployment URL ব্যবহার করা users-রা data share করে না।
User password Deno KV-তে salted PBKDF2 hash হিসেবে সংরক্ষিত হয়, plaintext হিসেবে নয়। Login session
Deno KV-তে সংরক্ষিত হয়, এবং browser cookie-তে শুধু একটি random session token থাকে। Settings, account
এবং debug mutation CSRF token validate করে, আর public deployment-এ sensitive operation rate-limited থাকে।

## Commands

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` processed-post marker মুছে দেয়, যাতে একই পোস্ট আবার verify করা যায়; production-এ এটি
সতর্কতার সঙ্গে ব্যবহার করুন।

## Deployment

Deno Deploy setup-এর জন্য [deployment](./deployment.md) দেখুন। অ্যাপের entrypoint `deno.json`-এর
`deploy` section দ্বারা নির্ধারিত হয়; GitHub Actions শুধু check চালায় এবং অ্যাপ deploy করে না।
`src/deploy.ts`-এর deploy entrypoint Deno Deploy Cron declare করে, এবং actual polling শুধু Production
ও `dev` Git Branch timeline-এ চলে। Notification relay Worker setup-এর জন্য [worker](./worker.md) দেখুন।

## License

এই project [GNU Affero General Public License v3.0](../../LICENSE)-এর অধীনে licensed।