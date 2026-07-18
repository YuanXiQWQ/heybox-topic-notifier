# Worker لترحيل الإشعارات

`notification-relay.js` هو ترحيل خفيف مخصص للاستخدام مع Cloudflare Workers، ولا يوفّر إلا:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> واجهة Server酱 الرسمية
- `GET /healthz` فحص الصحة

لا يقبل أي URL هدف عشوائي، لذلك لا يمكن استخدامه كوكيل مفتوح. يقبل مدخل Server酱 فقط SendKey آمنًا،
ويبني العنوان الرسمي وفق قواعد المشروع الحالية.

## خطوات النشر

1. أنشئ Worker مجانيًا في Cloudflare Workers.
2. الصق محتوى `workers/notification-relay.js` في محرر Worker، أو انشر هذا السكربت باستخدام Wrangler.
3. أضف `RELAY_TOKEN` إلى متغيرات/أسرار Worker، واجعل قيمته مفتاحًا عشوائيًا طويلًا.
4. بعد النشر، افتح `https://<your-worker>.workers.dev/healthz` وتأكد من أنه يعيد `{"status":"ok"}`.
5. اضبط Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

لن يرسل جانب المشروع ما يلي إلا عندما يتم تغيير عنوان إرسال PushPlus أو WxPusher أو Server酱 إلى عنوان الترحيل:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

كما يمرر ترحيل Server酱 قيمة SendKey عبر ترويسة طلب مخصصة:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## اختبار وحدة التحكم

يمكنك أولًا اختبار ما إذا كانت المصادقة تعمل من وحدة تحكم Worker أو باستخدام curl محليًا:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

اختبار WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

اختبار Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```