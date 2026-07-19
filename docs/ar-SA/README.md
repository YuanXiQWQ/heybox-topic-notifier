<div dir="rtl" lang="ar-SA" align="right">

# مُخطِر مواضيع Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **العربية** |
|:-----------------------:|:-----------:|

---

&rlm;<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
هو تطبيق Deno خفيف لمراقبة منشورات مواضيع Heybox. يقرأ التطبيق منشورات المواضيع الحقيقية دوريًا
وفقًا لإعدادات كل حساب، ويفحص العناوين والمحتوى والتعليقات والردود مقابل قواعد الكلمات المفتاحية،
ويسجل المطابقات في عرضَي الانتظار والسجل، ويرسل الإشعارات عبر القناة المُهيّأة.

## الميزات

- لوحة التحكم: عرض حالة الاستطلاع، وإجمالي المطابقات، وآخر مطابقة، والمطابقات المعلّقة، مع إجراء
  فحص يدوي
- صفحة الإعدادات: تهيئة معرّفات المواضيع، وحالة التفعيل، والملاحظات، ووحدة الفاصل الزمني للاستطلاع،
  وحدّ المنشورات، ووضع الترتيب، ولغة الواجهة، والوضع الداكن، ولون السمة
- إعدادات الحساب: التسجيل، وتسجيل الدخول، وتسجيل الخروج، وتحديث اسم المستخدم، وتحديث كلمة المرور؛
  بيانات الحساب معزولة حسب معرّف المستخدم
- قواعد الكلمات المفتاحية: دعم القواعد المشتركة، والقواعد الخاصة بكل موضوع، ومواضع المطابقة،
  وحساسية حالة الأحرف، والتعبيرات النمطية
- جداول المطابقات: تدعم سجلات الانتظار والسجل عوامل تصفية حسب النطاق الزمني، وترقيم الصفحات،
  والإكمال الدفعي، وإجراءات الحذف
- إدخالات التصحيح: مطابقات محاكاة واختبارات إشعارات، مع حدود معدّل من جهة الخادم للاستطلاع اليدوي
  وعمليات التصحيح
- قنوات الإشعارات: Webhook مخصص، وServerChan، وPushPlus، وWxPusher، وواجهة API للبريد الإلكتروني،
  وSMTP
- ترحيل الإشعارات: ترحيل Cloudflare Worker اختياري لـ PushPlus وWxPusher وServerChan
- الأمان: تجزئات كلمات مرور PBKDF2، وجلسات مدعومة بـ KV، ورموز CSRF، وترويسات أمان، وسجلات تدقيق،
  وقائمة سماح للاتصالات الصادرة مع التحقق من DNS

## المكدس التقني

- &rlm;Deno 2 + TypeScript
- &rlm;Hono
- &rlm;Deno KV
- &rlm;Deno.cron + مجدول مؤقت محلي
- &rlm;HTML مولّد من الخادم + JavaScript/CSS خالصان
- سكربت Cloudflare Workers لترحيل الإشعارات

## التطوير المحلي

ابدأ خادم التطوير:

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
</code></pre>

ثم افتح:

<pre dir='ltr' align='left'><code class='language-text'>http://localhost:8000
</code></pre>

لتجاوز القيم الافتراضية، استخدم `.env.example` كمرجع واضبط متغيرات البيئة المقابلة في بيئة التشغيل
الخاصة بك. سجّل حسابًا عند الزيارة الأولى؛ متغيرات البيئة تملأ القيم الافتراضية فقط للحسابات الجديدة
أو البيانات الافتراضية، وبعد ذلك تصبح صفحة إعدادات كل حساب هي مصدر الحقيقة.

يوفر التطبيق صفحات للتسجيل وتسجيل الدخول. لكل حساب إعدادات وسجل مطابقات وحالة استطلاع وتهيئة إشعارات
معزولة، لذلك لا يتشارك المستخدمون الذين يستخدمون عنوان URL نفسه للنشر البيانات. تُخزَّن كلمات مرور
المستخدمين في Deno KV كتجزئات PBKDF2 مملّحة، وليس كنص صريح. تُخزَّن جلسات تسجيل الدخول في Deno KV،
ولا يحتوي ملف تعريف الارتباط في المتصفح إلا على رمز جلسة عشوائي. تتحقق تغييرات الإعدادات والحساب
والتصحيح من رمز CSRF، وتخضع العمليات الحساسة لحدود معدّل في عمليات النشر العامة.

## الأوامر

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
deno task start
deno task check
deno task clear-seen
</code></pre>

يقوم `clear-seen` بمسح علامات المنشورات التي تمت معالجتها حتى يمكن التحقق من المنشورات نفسها مرة أخرى؛
استخدمه بحذر في بيئة الإنتاج.

## النشر

راجع [deployment](./deployment.md) لإعداد Deno Deploy. يتم تعريف نقطة دخول التطبيق من خلال قسم `deploy`
في `deno.json`؛ تقوم GitHub Actions بتشغيل الفحوصات فقط ولا تنشر التطبيق. تعلن نقطة دخول النشر في
`src/deploy.ts` عن Deno Deploy Cron، ولا يعمل الاستطلاع الفعلي إلا على Production وعلى مسار Git Branch
لـ `dev`. راجع [worker](./worker.md) لإعداد Worker الخاص بترحيل الإشعارات.

## الرخصة

هذا المشروع مرخّص بموجب [رخصة GNU Affero General Public License v3.0](../../LICENSE).

</div>
