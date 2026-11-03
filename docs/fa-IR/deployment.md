<div dir="rtl" lang="fa-IR" align="right">

سرویس Deno روی Oracle Cloud اجرا می‌شود و Caddy اتصال HTTPS را فراهم می‌کند. حساب‌ها، نشست‌ها و نتایج در Turso ذخیره می‌شوند. GitHub Actions بسته‌های نصب Windows و Android را از برچسب‌های انتشار می‌سازد.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## متغیرهای محیط اجرای برنامه

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

برای آزمایش از پایگاه دادهٔ جداگانه استفاده کنید. پس از توقف بررسی‌های دوره‌ای سرور قبلی، در محیط عملیاتی `VM_POLLING_ENABLED=true` را تنظیم و سرویس را دوباره اجرا کنید.

- مقدارهای پیش‌فرض پایه: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `NOTIFIER_PROVIDER`
- بهینه‌سازی polling: `POLL_INTERVAL_MINUTES`، `POLL_POST_LIMIT`، `POLL_SORT`
- بازنویسی درخواست‌های Heybox: `HEYBOX_SIGNATURE_MODE`، `HEYBOX_DEVICE_ID`، `HEYBOX_COOKIE`، `HEYBOX_USER_AGENT`
- گزینه‌های عمومی اعلان: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- اعلان Webhook: `NOTIFIER_WEBHOOK_SERVICE`، `NOTIFIER_WEBHOOK_URL`،
  `NOTIFIER_PUSHPLUS_TOKEN`، `NOTIFIER_WXPUSHER_SPT`، `NOTIFIER_SERVER_CHAN_SEND_KEY`
- اعلان ایمیل: `NOTIFIER_EMAIL_SERVICE`، `NOTIFIER_EMAIL_ADDRESS`، `NOTIFIER_EMAIL_FROM`،
  `NOTIFIER_EMAIL_API_URL`، `NOTIFIER_EMAIL_API_TOKEN`، `NOTIFIER_SMTP_HOST`،
  `NOTIFIER_SMTP_PORT`، `NOTIFIER_SMTP_SECURE`، `NOTIFIER_SMTP_USERNAME`، `NOTIFIER_SMTP_PASSWORD`
- رلهٔ اعلان: `NOTIFIER_PUSHPLUS_SEND_URL`، `NOTIFIER_WXPUSHER_SEND_URL`،
  `NOTIFIER_SERVER_CHAN_SEND_URL`، `NOTIFIER_RELAY_TOKEN`
- &rlm;allowlist امنیتی خروجی: `OUTBOUND_ALLOWED_HOSTS`

تحویل اعلان، مقصدهای Webhook سفارشی، Email API و SMTP را اعتبارسنجی می‌کند. به‌صورت پیش‌فرض فقط URLهای HTTPS عمومی و پورت‌های رایج SMTP
مجاز هستند؛ اگر نیاز به استفاده از رلهٔ خودمیزبان یا سرویس ایمیل ثابت دارید، می‌توانید با `OUTBOUND_ALLOWED_HOSTS` جداشده با ویرگول
میزبان‌های مربوط را صراحتاً مجاز کنید، مانند `relay.example.com,smtp.example.com`.
پس از تنظیم این متغیر، مقصد خروجی اعلان باید با یکی از میزبان‌های فهرست یا wildcard به شکل `*.example.com` مطابقت داشته باشد.

HTTP redirectها گام‌به‌گام اعتبارسنجی می‌شوند و فقط پرش‌های هم‌مبدأ مجازند. وقتی `OUTBOUND_ALLOWED_HOSTS` پیکربندی نشده باشد، نتایج DNS
A/AAAA میزبان مقصد نیز بررسی می‌شود تا در محدودهٔ localhost، شبکهٔ داخلی، link-local، سرویس metadata یا آدرس‌های رزرو‌شده قرار نگیرد. `OUTBOUND_ALLOWED_HOSTS`
مرز اعتماد صریحی است که مدیر تعیین می‌کند، و wildcard فقط باید زیر دامنه‌هایی پیکربندی شود که کاملاً تحت کنترل شما هستند.

واکشی واقعی موضوعات Heybox در حال حاضر تنها منبع دادهٔ در حال اجرا است. به‌صورت پیش‌فرض، `HEYBOX_SIGNATURE_MODE=app` از فهرست زمان انتشار App API تأییدشده استفاده می‌کند؛
`web` فقط به‌عنوان fallback تشخیصی نگه داشته شده است.
حساب‌های جدید با polling غیرفعال شروع می‌کنند و تنها پس از فعال‌کردن «فعال‌سازی polling» در صفحهٔ تنظیمات خودشان واکشی می‌کنند.

## رلهٔ اعلان

اگر Oracle Cloud نتواند مستقیماً به PushPlus، WxPusher یا Server酱 دسترسی داشته باشد، می‌توانید ابتدا یک Cloudflare Worker رایگان
برای رله مستقر کنید. فایل `workers/notification-relay.js` در مخزن سه ورودی ثابت `/pushplus`، `/wxpusher` و `/serverchan`
را برای forward فراهم می‌کند و برای احراز هویت از `Authorization: Bearer <token>` استفاده می‌کند؛ مراحل کامل را در [worker.md](worker.md) ببینید.

نمونهٔ پیکربندی سمت Oracle Cloud:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## اعتبارسنجی

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
