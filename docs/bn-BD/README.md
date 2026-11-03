# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **বাংলা** |
|:-----------------------:|:---------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

সেটিংসে Heybox বিষয় যোগ করুন, কীওয়ার্ড, রেগুলার এক্সপ্রেশন বা AI ফিল্টার বেছে নিয়ে নিয়মিত পরীক্ষা চালু করুন। মিলে যাওয়া পোস্ট ইতিহাসে পাঠানো যায় এবং আবার কর্মক্ষেত্রে ফিরিয়ে আনা যায়।

নতুন অ্যাকাউন্ট খুলতে আমন্ত্রণ কোড লাগে। প্রতিটি ডিভাইসে আলাদাভাবে অ্যাপের বিজ্ঞপ্তি চালু করা যায় এবং এর সঙ্গে ইমেইল বা Webhook ব্যবহার করা যায়। সংযোগ ফিরলে অফলাইনের পরিবর্তনগুলো সিঙ্ক হয়। শুরুতে ভাষা ও ডার্ক মোড ডিভাইসের সেটিং অনুসরণ করে।

## বৈশিষ্ট্য

- Dashboard: poll status, মোট match, সর্বশেষ match এবং pending match দেখা যায়, সঙ্গে manual
  check action
- Settings page: topic ID, enabled state, note, polling interval unit, post limit, sort mode,
  UI language, dark mode এবং theme color কনফিগার করা যায়
- Account settings: register, log in, log out, username update এবং password update; account data
  user ID অনুযায়ী আলাদা রাখা হয়
- Keyword rules: shared rule, topic-specific rule, match location, case sensitivity এবং regular
  expression সমর্থন করে
- সেটিংস → বিজ্ঞপ্তির সেটিংস → বিজ্ঞপ্তি পরীক্ষা
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API এবং SMTP
- Notification relay: PushPlus, WxPusher এবং ServerChan-এর জন্য optional Cloudflare Worker relay

## Local Development

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Deno পরিষেবা Oracle Cloud-এ চলে, আর Caddy HTTPS পরিচালনা করে। অ্যাকাউন্ট, সেশন ও ফলাফল Turso-তে থাকে। রিলিজ ট্যাগ থেকে GitHub Actions Windows ও Android ইনস্টলার তৈরি করে।

[নিজস্ব সার্ভারে স্থাপন](./deployment.md) · [Cloudflare Worker](./worker.md)

## License

এই project [GNU Affero General Public License v3.0](../../LICENSE)-এর অধীনে licensed।
