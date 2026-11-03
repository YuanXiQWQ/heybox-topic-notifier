<div dir="rtl" lang="fa-IR" align="right">

# اعلان‌کنندهٔ موضوعات Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **فارسی** |
|:-----------------------:|:---------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

در تنظیمات یک موضوع Heybox اضافه کنید، کلیدواژه، عبارت منظم یا فیلتر هوش مصنوعی را انتخاب کنید و بررسی دوره‌ای را فعال کنید. می‌توانید پست‌های منطبق را به تاریخچه منتقل کنید و به فضای کار برگردانید.

ساخت حساب به کد دعوت نیاز دارد. اعلان‌های برنامه برای هر دستگاه جداگانه فعال می‌شوند و می‌توان آن‌ها را همراه ایمیل یا Webhook به کار برد. تغییرات آفلاین پس از اتصال همگام می‌شوند. زبان و حالت تاریک در ابتدا از تنظیمات دستگاه پیروی می‌کنند.

## قابلیت‌ها

- داشبورد: نمایش وضعیت نظرسنجی، تعداد کل تطابق‌ها، آخرین تطابق و تطابق‌های در انتظار، همراه با
  اقدام بررسی دستی
- صفحهٔ تنظیمات: پیکربندی شناسه‌های موضوع، وضعیت فعال بودن، یادداشت‌ها، واحد بازهٔ نظرسنجی، محدودیت
  تعداد پست‌ها، حالت مرتب‌سازی، زبان رابط کاربری، حالت تیره و رنگ پوسته
- تنظیمات حساب: ثبت‌نام، ورود، خروج، به‌روزرسانی نام کاربری و به‌روزرسانی گذرواژه؛ داده‌های حساب بر
  اساس شناسهٔ کاربر جدا می‌شوند
- قواعد کلمات کلیدی: پشتیبانی از قواعد مشترک، قواعد مخصوص هر موضوع، محل‌های تطابق، حساسیت به بزرگی
  و کوچکی حروف و عبارت‌های منظم
- تنظیمات → تنظیمات اعلان → اعلان آزمایشی
- کانال‌های اعلان: Webhook سفارشی، ServerChan، PushPlus، WxPusher، API ایمیل و SMTP
- رلهٔ اعلان: رلهٔ اختیاری Cloudflare Worker برای PushPlus، WxPusher و ServerChan

## توسعهٔ محلی

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## استقرار

سرویس Deno روی Oracle Cloud اجرا می‌شود و Caddy اتصال HTTPS را فراهم می‌کند. حساب‌ها، نشست‌ها و نتایج در Turso ذخیره می‌شوند. GitHub Actions بسته‌های نصب Windows و Android را از برچسب‌های انتشار می‌سازد.

[نصب روی سرور شخصی](./deployment.md) · [Cloudflare Worker](./worker.md)

## مجوز

این پروژه تحت [GNU Affero General Public License v3.0](../../LICENSE) مجوزدهی شده است.

</div>
