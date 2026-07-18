# Worker رلهٔ اعلان

`notification-relay.js` یک رلهٔ سبک برای استفاده با Cloudflare Workers است و فقط این موارد را ارائه می‌دهد:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> رابط رسمی Server酱
- `GET /healthz` بررسی سلامت

این فایل URL مقصد دلخواه را نمی‌پذیرد، بنابراین نمی‌توان آن را به‌عنوان پروکسی باز استفاده کرد. ورودی Server酱 فقط
SendKey امن را می‌پذیرد و آدرس رسمی را مطابق قواعد موجود پروژه می‌سازد.

## مراحل استقرار

1. در Cloudflare Workers یک Worker رایگان ایجاد کنید.
2. محتوای `workers/notification-relay.js` را در ویرایشگر Worker جای‌گذاری کنید، یا این اسکریپت را با Wrangler مستقر کنید.
3. در متغیرها/رازهای Worker مقدار `RELAY_TOKEN` را اضافه کنید و مقدار آن را یک کلید تصادفی طولانی قرار دهید.
4. پس از استقرار، `https://<your-worker>.workers.dev/healthz` را باز کنید و مطمئن شوید `{"status":"ok"}` برمی‌گرداند.
5. در Deno Deploy پیکربندی کنید:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

سمت پروژه فقط زمانی این مورد را ارسال می‌کند که آدرس ارسال PushPlus، WxPusher یا Server酱 به آدرس رله تغییر داده شده باشد:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

رلهٔ Server酱 همچنین SendKey را از طریق یک request header اختصاصی عبور می‌دهد:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## آزمون کنسول

می‌توانید ابتدا در کنسول Worker یا با curl محلی بررسی کنید که احراز هویت فعال است یا نه:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

آزمون WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

آزمون Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```