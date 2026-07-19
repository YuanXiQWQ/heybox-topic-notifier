<div dir="rtl" lang="fa-IR" align="right">

# Worker رلهٔ اعلان

`notification-relay.js` یک رلهٔ سبک برای استفاده با Cloudflare Workers است و فقط این موارد را ارائه می‌دهد:

- &rlm;`POST /pushplus` -> `https://www.pushplus.plus/send`
- &rlm;`POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- &rlm;`POST /serverchan` -> رابط رسمی Server酱
- &rlm;`GET /healthz` بررسی سلامت

این فایل URL مقصد دلخواه را نمی‌پذیرد، بنابراین نمی‌توان آن را به‌عنوان پروکسی باز استفاده کرد. ورودی Server酱 فقط
SendKey امن را می‌پذیرد و آدرس رسمی را مطابق قواعد موجود پروژه می‌سازد.

## مراحل استقرار

1. در Cloudflare Workers یک Worker رایگان ایجاد کنید.
2. محتوای `workers/notification-relay.js` را در ویرایشگر Worker جای‌گذاری کنید، یا این اسکریپت را با Wrangler مستقر کنید.
3. در متغیرها/رازهای Worker مقدار `RELAY_TOKEN` را اضافه کنید و مقدار آن را یک کلید تصادفی طولانی قرار دهید.
4. پس از استقرار، `https://<your-worker>.workers.dev/healthz` را باز کنید و مطمئن شوید `{"status":"ok"}` برمی‌گرداند.
5. در Deno Deploy پیکربندی کنید:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

سمت پروژه فقط زمانی این مورد را ارسال می‌کند که آدرس ارسال PushPlus، WxPusher یا Server酱 به آدرس رله تغییر داده شده باشد:

<pre dir='ltr' align='left'><code class='language-http'>Authorization: Bearer &lt;NOTIFIER_RELAY_TOKEN&gt;
</code></pre>

رلهٔ Server酱 همچنین SendKey را از طریق یک request header اختصاصی عبور می‌دهد:

<pre dir='ltr' align='left'><code class='language-http'>X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;
</code></pre>

## آزمون کنسول

می‌توانید ابتدا در کنسول Worker یا با curl محلی بررسی کنید که احراز هویت فعال است یا نه:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/pushplus" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"token":"&lt;pushplus-token&gt;","title":"relay test","content":"hello","template":"markdown"}'
</code></pre>

آزمون WxPusher:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/wxpusher" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"spt":"&lt;wxpusher-spt&gt;","summary":"relay test","content":"hello","contentType":1}'
</code></pre>

آزمون Server酱:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/serverchan" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
</code></pre>

</div>
