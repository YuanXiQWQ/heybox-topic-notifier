<div dir="rtl" lang="ar-SA" align="right">

تعمل خدمة Deno على Oracle Cloud ويتولى Caddy اتصالات HTTPS. تُحفظ الحسابات والجلسات والنتائج في Turso. ينشئ GitHub Actions حزم تثبيت Windows وAndroid عند دفع وسم إصدار.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## متغيرات بيئة التشغيل

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

استخدم قاعدة بيانات مستقلة للاختبار. بعد إيقاف الفحص الدوري على الخادم السابق، اضبط `VM_POLLING_ENABLED=true` في بيئة الإنتاج وأعد تشغيل الخدمة.

- القيم الافتراضية الأساسية: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `NOTIFIER_PROVIDER`
- تحسين polling: `POLL_INTERVAL_MINUTES`، `POLL_POST_LIMIT`، `POLL_SORT`
- تجاوزات طلبات Heybox: `HEYBOX_SIGNATURE_MODE`، `HEYBOX_DEVICE_ID`، `HEYBOX_COOKIE`، `HEYBOX_USER_AGENT`
- عناصر الإشعارات العامة: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- إشعارات Webhook: `NOTIFIER_WEBHOOK_SERVICE`، `NOTIFIER_WEBHOOK_URL`،
  `NOTIFIER_PUSHPLUS_TOKEN`، `NOTIFIER_WXPUSHER_SPT`، `NOTIFIER_SERVER_CHAN_SEND_KEY`
- إشعارات البريد الإلكتروني: `NOTIFIER_EMAIL_SERVICE`، `NOTIFIER_EMAIL_ADDRESS`، `NOTIFIER_EMAIL_FROM`،
  `NOTIFIER_EMAIL_API_URL`، `NOTIFIER_EMAIL_API_TOKEN`، `NOTIFIER_SMTP_HOST`،
  `NOTIFIER_SMTP_PORT`، `NOTIFIER_SMTP_SECURE`، `NOTIFIER_SMTP_USERNAME`، `NOTIFIER_SMTP_PASSWORD`
- ترحيل الإشعارات: `NOTIFIER_PUSHPLUS_SEND_URL`، `NOTIFIER_WXPUSHER_SEND_URL`،
  `NOTIFIER_SERVER_CHAN_SEND_URL`، `NOTIFIER_RELAY_TOKEN`
- قائمة السماح الأمنية للاتصالات الصادرة: `OUTBOUND_ALLOWED_HOSTS`

يتحقق تسليم الإشعارات من أهداف Webhook المخصّصة وEmail API وSMTP. افتراضيًا، لا يُسمح إلا بعناوين HTTPS العامة ومنافذ SMTP الشائعة؛
إذا احتجت إلى استخدام ترحيل مستضاف ذاتيًا أو خدمة بريد ثابتة، فيمكنك استخدام `OUTBOUND_ALLOWED_HOSTS` مفصولة بفواصل
للسماح صراحةً بالمضيفين المقابلين، مثل `relay.example.com,smtp.example.com`.
بعد ضبط هذا المتغير، يجب أن يطابق هدف الإشعار الصادر مضيفًا ضمن القائمة أو wildcard بصيغة `*.example.com`.

يتم التحقق من عمليات HTTP redirect خطوة بخطوة، ولا يُسمح إلا بالانتقال داخل نفس الأصل؛ وعند عدم ضبط `OUTBOUND_ALLOWED_HOSTS`، يتم أيضًا التحقق من أن نتائج DNS
A/AAAA للمضيف الهدف لا تقع ضمن عناوين الجهاز المحلي، أو الشبكة الداخلية، أو link-local، أو خدمة metadata، أو نطاقات العناوين المحجوزة. يمثّل `OUTBOUND_ALLOWED_HOSTS`
حدّ ثقة صريحًا يحدده المسؤول، ويجب عدم استخدام wildcard إلا تحت نطاقات تتحكم بها بالكامل.

جلب مواضيع Heybox الحقيقية هو مصدر بيانات التشغيل الوحيد حاليًا. يستخدم الوضع الافتراضي `HEYBOX_SIGNATURE_MODE=app` قائمة نشر App API التي تم التحقق منها؛
ويُحتفظ بـ `web` فقط كخيار تشخيصي احتياطي.
تبدأ الحسابات الجديدة مع تعطيل polling، ولا تجلب البيانات إلا بعد تفعيل خيار “تمكين polling” في صفحة إعداداتها.

## ترحيل الإشعارات

إذا لم يتمكن Oracle Cloud من الوصول مباشرة إلى PushPlus أو WxPusher أو Server酱، فيمكن أولًا نشر Cloudflare Worker مجاني
للترحيل. يوفّر `workers/notification-relay.js` في المستودع ثلاثة مداخل تحويل ثابتة هي `/pushplus` و`/wxpusher` و`/serverchan`،
ويستخدم `Authorization: Bearer <token>` للمصادقة؛ راجع [worker.md](worker.md) للخطوات الكاملة.

مثال إعدادات جهة Oracle Cloud:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## التحقق

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
