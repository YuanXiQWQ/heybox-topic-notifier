<div dir="rtl" lang="fa-IR" align="right">

# راهنمای استقرار

این پروژه با یکپارچه‌سازی GitHub در Deno Deploy مستقر می‌شود و از GitHub Actions برای استقرار برنامه استفاده نمی‌کند. GitHub Actions فقط
`deno task check` را اجرا می‌کند، و Deno Deploy پس از push به مخزن، ساخت و مسیریابی برنامه را انجام می‌دهد.

## استقرار شاخه‌ها

Deno Deploy برای یک App واحد timelineهای متفاوت ایجاد می‌کند:

- &rlm;`main`: استقرار انتشار رسمی، مسیریابی‌شده به Production URL
- &rlm;`dev`: استقرار آزمایشی پیش از انتشار، مسیریابی‌شده به Git Branch / DEV URL

وقتی نام App فعلی `heybox-topic-notifier` باشد، قرارداد URL تقریباً چنین است:

<pre dir='ltr' align='left'><code class='language-text'>https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
</code></pre>

استقرار آزمایشی فعلی `dev` ایجاد شده است و ورودی پایدار آزمایش همان Git Branch / DEV URL است. pushهای بعدی به `dev`
باعث به‌روزرسانی استقرار آزمایشی می‌شوند، و push به `main` باعث به‌روزرسانی Production می‌شود.

یکپارچه‌سازی GitHub در Deno Deploy ممکن است برای push شاخه‌های feature، Git Branch timeline و Build ایجاد کند. برای جلوگیری از این‌که Preview
و شاخه‌های معمولی feature به‌صورت تکراری KV را بخوانند، Heybox را واکشی کنند یا اعلان بفرستند، نقطهٔ ورود استقرار Cron را در سطح بالا اعلام می‌کند، اما handler فقط زمانی ادامه می‌دهد که
`DENO_TIMELINE=production` یا `DENO_TIMELINE=git-branch/dev` باشد. درخواست‌های عادی صفحه، مسیر ریشه،
بررسی سلامت و درخواست‌های Warm up
باعث polling خودکار نمی‌شوند؛ پرس‌وجوهای زمان‌رسیدهٔ صفحهٔ جلویی با کمتر از یک دقیقه، زمان‌بندی حساب فعلی را از طریق یک رابط وضعیت کنترل‌شده فعال می‌کنند.

## پیکربندی Deno Deploy

در Deno Deploy App پیکربندی زیر را حفظ کنید:

- &rlm;Repository: `YuanXiQWQ/heybox-topic-notifier`
- &rlm;App Directory: root directory
- &rlm;Entrypoint: `./src/deploy.ts`
- &rlm;Config Source: `deno.json deploy section`

پیکربندی deploy در `deno.json` تنها منبع پیکربندی مخزن برای نقطهٔ ورود استقرار است.

## پایگاه داده

Deno Deploy App به پایگاه دادهٔ Deno KV متصل شده است. کد با `Deno.openKv()`
حساب‌ها، تنظیمات، تاریخچه، وضعیت polling و نشانگرهای پست‌های پردازش‌شده را می‌خواند و می‌نویسد. گذرواژه‌های حساب به‌صورت هش‌های PBKDF2 نمک‌گذاری‌شده ذخیره می‌شوند؛ داده‌های کاربر بر اساس پیشوند user
ID جدا می‌شوند، و Deno Deploy نیز داده‌های Production و Git Branch را بر اساس timeline جدا می‌کند.

## متغیرهای محیط اجرای برنامه

در Deno Deploy App بر اساس نیاز پیکربندی کنید. فایل `.env.example` در ریشهٔ مخزن بر اساس سناریوها مرتب شده است: به‌صورت پیش‌فرض فقط حداقل پیکربندی قابل استفاده فعال است،
و سایر تنظیمات بهینه‌سازی polling، کانال‌های اعلان، رله و allowlist امنیتی به‌صورت comment باقی می‌مانند؛ برای هر سناریو فقط خط‌های مربوط را از حالت comment خارج کنید.

- مقدارهای پیش‌فرض پایه: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `POLL_ENABLED`، `NOTIFIER_PROVIDER`
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

برنامه صفحه‌های ثبت‌نام و ورود ارائه می‌دهد. اطلاعات حساب، نشست‌های ورود، و تنظیمات، رکوردهای تطابق، وضعیت polling و پیکربندی اعلان هر حساب در
Deno KV ذخیره می‌شوند و بر اساس user ID جدا هستند. کوکی مرورگر فقط یک session token تصادفی ذخیره می‌کند؛ سرور hash توکن
و زمان انقضا را ذخیره می‌کند.

واکشی واقعی موضوعات Heybox در حال حاضر تنها منبع دادهٔ در حال اجرا است. به‌صورت پیش‌فرض، `HEYBOX_SIGNATURE_MODE=app` از فهرست زمان انتشار App API تأییدشده استفاده می‌کند؛
`web` فقط به‌عنوان fallback تشخیصی نگه داشته شده است. `POLL_ENABLED`
فقط به‌عنوان کلید اولیهٔ polling برای حساب‌های جدید یا حساب پیش‌فرض عمل می‌کند؛ این‌که واقعاً واکشی انجام شود، به گزینهٔ «فعال‌سازی polling» در صفحهٔ تنظیمات هر حساب بستگی دارد.

## رلهٔ اعلان

اگر Deno Deploy نتواند مستقیماً به PushPlus، WxPusher یا Server酱 دسترسی داشته باشد، می‌توانید ابتدا یک Cloudflare Worker رایگان
برای رله مستقر کنید. فایل `workers/notification-relay.js` در مخزن سه ورودی ثابت `/pushplus`، `/wxpusher` و `/serverchan`
را برای forward فراهم می‌کند و برای احراز هویت از `Authorization: Bearer <token>` استفاده می‌کند؛ مراحل کامل را در [worker.md](worker.md) ببینید.

نمونهٔ پیکربندی سمت Deno Deploy:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## اعتبارسنجی

پس از تکمیل استقرار، باز کنید:

<pre dir='ltr' align='left'><code class='language-text'>/healthz
</code></pre>

بازگشت `status: ok` یعنی فرایند سرویس شروع شده است و بررسی سلامت Deno KV را نمی‌خواند.

</div>
