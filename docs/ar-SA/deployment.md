<div dir="rtl" lang="ar-SA" align="right">

# تعليمات النشر

يستخدم هذا المشروع تكامل GitHub في Deno Deploy للنشر، ولا يستخدم GitHub Actions لنشر التطبيق. يقتصر دور GitHub Actions على تشغيل
`deno task check`، بينما يتولى Deno Deploy بناء التطبيق وتوجيهه بعد أي push إلى المستودع.

## نشر الفروع

ينشئ Deno Deploy خطوطًا زمنية مختلفة لنفس App:

- &rlm;`main`: نشر الإصدار الرسمي، ويُوجَّه إلى Production URL
- &rlm;`dev`: نشر اختبار ما قبل الإصدار، ويُوجَّه إلى Git Branch / DEV URL

عندما يكون اسم App الحالي هو `heybox-topic-notifier`، تكون صيغة URL المتفق عليها تقريبًا:

<pre dir='ltr' align='left'><code class='language-text'>https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
</code></pre>

تم إنشاء نشر الاختبار الحالي لـ `dev` بالفعل، ونقطة الدخول المستقرة للاختبار هي Git Branch / DEV URL. ستؤدي عمليات push اللاحقة إلى `dev`
إلى تحديث نشر الاختبار، بينما ستؤدي عمليات push إلى `main` إلى تحديث Production.

قد ينشئ تكامل GitHub في Deno Deploy خطوطًا زمنية من نوع Git Branch وعمليات Build عند push إلى فروع الميزات. لتجنب أن تقوم Preview
والفروع العادية للميزات بقراءة KV أو جلب Heybox أو إرسال إشعارات بشكل مكرر، يصرّح مدخل النشر بـ Cron في المستوى الأعلى، لكن handler لن يواصل التنفيذ إلا عندما تكون
`DENO_TIMELINE=production` أو `DENO_TIMELINE=git-branch/dev`. طلبات الصفحات العادية، والمسار الجذر، وفحص الصحة، وطلبات Warm up
لن تؤدي إلى تشغيل polling تلقائي؛ أما استعلامات الواجهة الأمامية التي يحين موعدها خلال أقل من دقيقة فستشغّل جدولة الحساب الحالي عبر واجهة حالة مضبوطة.

## إعدادات Deno Deploy

حافظ على الإعدادات التالية في Deno Deploy App:

- &rlm;Repository: `YuanXiQWQ/heybox-topic-notifier`
- &rlm;App Directory: root directory
- &rlm;Entrypoint: `./src/deploy.ts`
- &rlm;Config Source: `deno.json deploy section`

إعداد `deploy` داخل `deno.json` هو المصدر الوحيد لإعدادات المستودع الخاصة بمدخل النشر.

## قاعدة البيانات

تم ربط Deno Deploy App بقاعدة بيانات Deno KV. يستخدم الكود `Deno.openKv()`
لقراءة وكتابة الحسابات، والإعدادات، والسجل، وحالة polling، وعلامات المنشورات التي تمت معالجتها. تُخزّن كلمات مرور الحسابات كتجزئات PBKDF2 مملّحة؛ وتعزل بيانات المستخدمين حسب بادئة user
ID، كما يعزل Deno Deploy بيانات Production وGit Branch حسب timeline.

## متغيرات بيئة التشغيل

تُضبط في Deno Deploy App حسب الحاجة. تم تنظيم `.env.example` في جذر المستودع حسب السيناريوهات: افتراضيًا لا يفعّل إلا الحد الأدنى القابل للاستخدام،
بينما تبقى إعدادات تحسين polling، وقنوات الإشعارات، والترحيل، وقوائم السماح الأمنية معلّقة، وتُزال علامة التعليق فقط عن الأسطر المناسبة للسيناريو المطلوب.

- القيم الافتراضية الأساسية: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `POLL_ENABLED`، `NOTIFIER_PROVIDER`
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

يوفر التطبيق صفحات تسجيل وإنشاء جلسة دخول. تُخزن معلومات الحساب، وجلسات تسجيل الدخول، وإعدادات كل حساب، وسجلات المطابقات، وحالة polling، وإعدادات الإشعارات في
Deno KV، وتُعزل حسب user ID. لا يحفظ Browser Cookie إلا random session token؛ بينما يحفظ الخادم token
hash ووقت الانتهاء.

جلب مواضيع Heybox الحقيقية هو مصدر بيانات التشغيل الوحيد حاليًا. يستخدم الوضع الافتراضي `HEYBOX_SIGNATURE_MODE=app` قائمة نشر App API التي تم التحقق منها؛
ويُحتفظ بـ `web` فقط كخيار تشخيصي احتياطي. يعمل `POLL_ENABLED`
فقط كمفتاح polling أولي للحسابات الجديدة أو الحساب الافتراضي؛ أما ما إذا كان الجلب سيحدث فعليًا، فيعتمد على خيار “تمكين polling” داخل صفحة إعدادات كل حساب.

## ترحيل الإشعارات

إذا لم يتمكن Deno Deploy من الوصول مباشرة إلى PushPlus أو WxPusher أو Server酱، فيمكن أولًا نشر Cloudflare Worker مجاني
للترحيل. يوفّر `workers/notification-relay.js` في المستودع ثلاثة مداخل تحويل ثابتة هي `/pushplus` و`/wxpusher` و`/serverchan`،
ويستخدم `Authorization: Bearer <token>` للمصادقة؛ راجع [worker.md](worker.md) للخطوات الكاملة.

مثال إعدادات جهة Deno Deploy:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## التحقق

بعد اكتمال النشر، افتح:

<pre dir='ltr' align='left'><code class='language-text'>/healthz
</code></pre>

إذا أعاد `status: ok` فهذا يعني أن عملية الخدمة قد بدأت، وأن فحص الصحة لا يقرأ Deno KV.

</div>
