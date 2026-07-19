# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **हिन्दी** |
|:-----------------------:|:----------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
Heybox topic पोस्ट की निगरानी के लिए एक हल्का Deno ऐप है। यह हर खाते की settings के अनुसार समय-समय पर
वास्तविक topic पोस्ट पढ़ता है, title, body, comment और reply को keyword rules से मिलाता है, matches को
pending और history views में रिकॉर्ड करता है, और configured channel के माध्यम से notifications भेजता है।

## विशेषताएँ

- Dashboard: poll status, कुल matches, latest match और pending matches देखें, manual check action के साथ
- Settings page: topic IDs, enabled state, notes, polling interval unit, post limit, sort mode,
  UI language, dark mode और theme color configure करें
- Account settings: register, log in, log out, username update और password update; account data user ID
  के अनुसार अलग रखा जाता है
- Keyword rules: shared rules, topic-specific rules, match locations, case sensitivity और regular
  expressions का समर्थन
- Match tables: pending और history records दोनों time-range filters, pagination, batch-complete और
  delete actions का समर्थन करते हैं
- Debug entries: simulated matches और notification tests, manual polling और debug operations के लिए
  server-side rate limits के साथ
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API और SMTP
- Notification relay: PushPlus, WxPusher और ServerChan के लिए optional Cloudflare Worker relay
- Security: PBKDF2 password hashes, KV-backed sessions, CSRF tokens, security headers, audit logs,
  और outbound allowlist/DNS validation

## टेक्नोलॉजी स्टैक

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + local timer scheduler
- Server-rendered HTML + vanilla JavaScript/CSS
- Cloudflare Workers notification relay script

## Local Development

Development server शुरू करें:

```powershell
deno task dev
```

फिर खोलें:

```text
http://localhost:8000
```

Defaults को override करने के लिए `.env.example` को reference के रूप में उपयोग करें और अपने runtime
environment में संबंधित environment variables सेट करें। पहली visit पर account register करें; environment
variables केवल नए accounts या default data के लिए default values seed करते हैं, और उसके बाद हर account
की settings page source of truth बन जाती है।

ऐप registration और login pages प्रदान करता है। हर account की settings, match history, polling state और
notification configuration अलग-अलग होती है, इसलिए एक ही deployment URL साझा करने वाले users data share
नहीं करते। User passwords Deno KV में salted PBKDF2 hashes के रूप में stored होते हैं, plaintext के रूप में
नहीं। Login sessions Deno KV में stored होते हैं, और browser cookie में केवल एक random session token होता
है। Settings, account और debug mutations CSRF token validate करते हैं, और public deployments पर sensitive
operations rate-limited होते हैं।

## Commands

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` processed-post markers को clear करता है ताकि उन्हीं posts को दोबारा verify किया जा सके;
production में इसे सावधानी से उपयोग करें।

## Deployment

Deno Deploy setup के लिए [deployment](./deployment.md) देखें। ऐप entrypoint `deno.json` के `deploy`
section द्वारा defined है; GitHub Actions केवल checks चलाता है और ऐप deploy नहीं करता। `src/deploy.ts`
में deploy entrypoint Deno Deploy Cron declare करता है, और actual polling केवल Production और `dev`
Git Branch timeline पर चलता है। Notification relay Worker setup के लिए [worker](./worker.md) देखें।

## License

यह project [GNU Affero General Public License v3.0](../../LICENSE) के अंतर्गत licensed है।