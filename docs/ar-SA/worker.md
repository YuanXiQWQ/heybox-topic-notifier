<div dir="rtl" lang="ar-SA" align="right">

# Worker لترحيل الإشعارات

`notification-relay.js` هو ترحيل خفيف مخصص للاستخدام مع Cloudflare Workers، ولا يوفّر إلا:

- &rlm;`POST /pushplus` -> `https://www.pushplus.plus/send`
- &rlm;`POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- &rlm;`POST /serverchan` -> واجهة Server酱 الرسمية
- &rlm;`GET /healthz` فحص الصحة

لا يقبل أي URL هدف عشوائي، لذلك لا يمكن استخدامه كوكيل مفتوح. يقبل مدخل Server酱 فقط SendKey آمنًا،
ويبني العنوان الرسمي وفق قواعد المشروع الحالية.

## خطوات النشر

1. أنشئ Worker مجانيًا في Cloudflare Workers.
2. الصق محتوى `workers/notification-relay.js` في محرر Worker، أو انشر هذا السكربت باستخدام Wrangler.
3. أضف `RELAY_TOKEN` إلى متغيرات/أسرار Worker، واجعل قيمته مفتاحًا عشوائيًا طويلًا.
4. بعد النشر، افتح `https://<your-worker>.workers.dev/healthz` وتأكد من أنه يعيد `{"status":"ok"}`.
5. اضبط Deno Deploy:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

لن يرسل جانب المشروع ما يلي إلا عندما يتم تغيير عنوان إرسال PushPlus أو WxPusher أو Server酱 إلى عنوان الترحيل:

<pre dir='ltr' align='left'><code class='language-http'>Authorization: Bearer &lt;NOTIFIER_RELAY_TOKEN&gt;
</code></pre>

كما يمرر ترحيل Server酱 قيمة SendKey عبر ترويسة طلب مخصصة:

<pre dir='ltr' align='left'><code class='language-http'>X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;
</code></pre>

## اختبار وحدة التحكم

يمكنك أولًا اختبار ما إذا كانت المصادقة تعمل من وحدة تحكم Worker أو باستخدام curl محليًا:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/pushplus" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"token":"&lt;pushplus-token&gt;","title":"relay test","content":"hello","template":"markdown"}'
</code></pre>

اختبار WxPusher:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/wxpusher" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"spt":"&lt;wxpusher-spt&gt;","summary":"relay test","content":"hello","contentType":1}'
</code></pre>

اختبار Server酱:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/serverchan" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
</code></pre>

</div>
