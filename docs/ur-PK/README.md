<div dir="rtl" lang="ur-PK" align="right">

# Heybox موضوع اطلاع دہندہ

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **اردو** |
|:-----------------------:|:--------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

ترتیبات میں Heybox کا موضوع شامل کریں، کلیدی الفاظ، ریگولر ایکسپریشن یا AI فلٹر منتخب کریں اور وقفے وقفے سے جانچ فعال کریں۔ متعلقہ پوسٹس تاریخچے میں منتقل کی جا سکتی ہیں اور دوبارہ کام کی جگہ پر لائی جا سکتی ہیں۔

نیا اکاؤنٹ بنانے کے لیے دعوتی کوڈ درکار ہے۔ ہر آلے پر ایپ کی اطلاعات الگ سے فعال ہوتی ہیں اور ای میل یا Webhook کے ساتھ استعمال کی جا سکتی ہیں۔ رابطہ بحال ہونے پر آف لائن تبدیلیاں ہم آہنگ ہو جاتی ہیں۔ زبان اور ڈارک موڈ شروع میں آلے کی ترتیبات کے مطابق ہوتے ہیں۔

## خصوصیات

- ڈیش بورڈ: poll status، کل مطابقتیں، تازہ ترین مطابقت اور pending مطابقتیں دیکھیں، manual check action کے ساتھ
- ترتیبات کا صفحہ: topic IDs، enabled state، notes، polling interval unit، post limit، sort mode،
  UI language، dark mode اور theme color ترتیب دیں
- اکاؤنٹ ترتیبات: register، log in، log out، username update اور password update؛ اکاؤنٹ ڈیٹا user ID
  کے مطابق الگ رکھا جاتا ہے
- کلیدی الفاظ کے قواعد: shared rules، topic-specific rules، match locations، case sensitivity اور
  regular expressions کی حمایت
- ترتیبات → اطلاعات کی ترتیبات → اطلاع کی آزمائش
- اطلاع کے چینلز: custom Webhook، ServerChan، PushPlus، WxPusher، email API اور SMTP
- اطلاع relay: PushPlus، WxPusher اور ServerChan کے لیے optional Cloudflare Worker relay

## مقامی ترقی

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Deno سروس Oracle Cloud پر چلتی ہے اور Caddy کے ذریعے HTTPS فراہم کیا جاتا ہے۔ اکاؤنٹس، سیشن اور نتائج Turso میں محفوظ ہوتے ہیں۔ GitHub Actions ریلیز ٹیگ سے Windows اور Android کے انسٹالر بناتا ہے۔

[اپنے سرور پر تنصیب](./deployment.md) · [Cloudflare Worker](./worker.md)

## لائسنس

یہ project [GNU Affero General Public License v3.0](../../LICENSE) کے تحت licensed ہے۔

</div>
