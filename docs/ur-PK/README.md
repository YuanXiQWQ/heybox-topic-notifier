<div dir="rtl" lang="ur-PK" align="right">

# Heybox موضوع اطلاع دہندہ

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **اردو** |
|:-----------------------:|:--------:|

---

&rlm;<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
Heybox کے موضوعاتی پوسٹس کی نگرانی کے لیے ایک ہلکی Deno ایپ ہے۔ یہ ہر اکاؤنٹ کی ترتیبات کے مطابق
حقیقی موضوعاتی پوسٹس کو وقفے وقفے سے پڑھتی ہے، عنوانات، متن، تبصروں اور جوابات کو کلیدی الفاظ کے
قواعد کے مقابلے میں جانچتی ہے، مطابقتوں کو pending اور history views میں ریکارڈ کرتی ہے، اور ترتیب دیے
گئے چینل کے ذریعے اطلاعات بھیجتی ہے۔

## خصوصیات

- ڈیش بورڈ: poll status، کل مطابقتیں، تازہ ترین مطابقت اور pending مطابقتیں دیکھیں، manual check action کے ساتھ
- ترتیبات کا صفحہ: topic IDs، enabled state، notes، polling interval unit، post limit، sort mode،
  UI language، dark mode اور theme color ترتیب دیں
- اکاؤنٹ ترتیبات: register، log in، log out، username update اور password update؛ اکاؤنٹ ڈیٹا user ID
  کے مطابق الگ رکھا جاتا ہے
- کلیدی الفاظ کے قواعد: shared rules، topic-specific rules، match locations، case sensitivity اور
  regular expressions کی حمایت
- مطابقت کی جدولیں: pending اور history records دونوں time-range filters، pagination، batch-complete
  اور delete actions کی حمایت کرتے ہیں
- &rlm;Debug entries: simulated matches اور notification tests، manual polling اور debug operations کے لیے
  server-side rate limits کے ساتھ
- اطلاع کے چینلز: custom Webhook، ServerChan، PushPlus، WxPusher، email API اور SMTP
- اطلاع relay: PushPlus، WxPusher اور ServerChan کے لیے optional Cloudflare Worker relay
- سیکیورٹی: PBKDF2 password hashes، KV-backed sessions، CSRF tokens، security headers، audit logs،
  اور outbound allowlist/DNS validation

## ٹیکنالوجی اسٹیک

- &rlm;Deno 2 + TypeScript
- &rlm;Hono
- &rlm;Deno KV
- &rlm;Deno.cron + local timer scheduler
- &rlm;Server-rendered HTML + vanilla JavaScript/CSS
- &rlm;Cloudflare Workers notification relay script

## مقامی ترقی

development server شروع کریں:

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
</code></pre>

پھر کھولیں:

<pre dir='ltr' align='left'><code class='language-text'>http://localhost:8000
</code></pre>

default values کو override کرنے کے لیے `.env.example` کو reference کے طور پر استعمال کریں اور اپنے runtime
environment میں متعلقہ environment variables set کریں۔ پہلی visit پر ایک account register کریں؛ environment
variables صرف نئے accounts یا default data کے لیے default values seed کرتے ہیں، اور اس کے بعد ہر account کا
settings page source of truth بن جاتا ہے۔

ایپ registration اور login pages فراہم کرتی ہے۔ ہر account کی settings، match history، polling state اور
notification configuration الگ ہوتی ہے، اس لیے وہ users جو ایک ہی deployment URL استعمال کرتے ہیں data share
نہیں کرتے۔ User passwords Deno KV میں salted PBKDF2 hashes کے طور پر stored ہوتے ہیں، plaintext کے طور پر
نہیں۔ Login sessions Deno KV میں stored ہوتے ہیں، اور browser cookie میں صرف ایک random session token ہوتا
ہے۔ Settings، account اور debug mutations CSRF token validate کرتے ہیں، اور public deployments پر sensitive
operations rate-limited ہوتے ہیں۔

## Commands

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
deno task start
deno task check
deno task clear-seen
</code></pre>

`clear-seen` processed-post markers کو clear کرتا ہے تاکہ وہی posts دوبارہ verify کیے جا سکیں؛ production
میں اسے احتیاط سے استعمال کریں۔

## Deployment

Deno Deploy setup کے لیے [deployment](./deployment.md) دیکھیں۔ ایپ entrypoint `deno.json` کے `deploy`
section سے defined ہے؛ GitHub Actions صرف checks چلاتا ہے اور ایپ deploy نہیں کرتا۔ `src/deploy.ts` میں
deploy entrypoint Deno Deploy Cron declare کرتا ہے، اور actual polling صرف Production اور `dev` Git Branch
timeline پر چلتا ہے۔ notification relay Worker setup کے لیے [worker](./worker.md) دیکھیں۔

## لائسنس

یہ project [GNU Affero General Public License v3.0](../../LICENSE) کے تحت licensed ہے۔

</div>
