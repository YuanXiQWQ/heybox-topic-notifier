<div dir="rtl" lang="ar-SA" align="right">

# مُخطِر مواضيع Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **العربية** |
|:-----------------------:|:-----------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

أضف موضوعًا من Heybox في الإعدادات، واختر كلمات مفتاحية أو تعبيرات نمطية أو مرشح الذكاء الاصطناعي، ثم فعّل الفحص الدوري. يمكنك نقل المنشورات المطابقة إلى السجل وإعادتها إلى مساحة العمل.

يتطلب إنشاء حساب رمز دعوة. تُفعّل إشعارات التطبيق لكل جهاز ويمكن استخدامها مع البريد الإلكتروني أو Webhook. تتزامن التعديلات عند عودة الاتصال. تتبع اللغة والوضع الداكن إعدادات الجهاز افتراضيًا.

## الميزات

- لوحة التحكم: عرض حالة الاستطلاع، وإجمالي المطابقات، وآخر مطابقة، والمطابقات المعلّقة، مع إجراء
  فحص يدوي
- صفحة الإعدادات: تهيئة معرّفات المواضيع، وحالة التفعيل، والملاحظات، ووحدة الفاصل الزمني للاستطلاع،
  وحدّ المنشورات، ووضع الترتيب، ولغة الواجهة، والوضع الداكن، ولون السمة
- إعدادات الحساب: التسجيل، وتسجيل الدخول، وتسجيل الخروج، وتحديث اسم المستخدم، وتحديث كلمة المرور؛
  بيانات الحساب معزولة حسب معرّف المستخدم
- قواعد الكلمات المفتاحية: دعم القواعد المشتركة، والقواعد الخاصة بكل موضوع، ومواضع المطابقة،
  وحساسية حالة الأحرف، والتعبيرات النمطية
- الإعدادات → إعدادات الإشعارات → اختبار الإشعار
- قنوات الإشعارات: Webhook مخصص، وServerChan، وPushPlus، وWxPusher، وواجهة API للبريد الإلكتروني،
  وSMTP
- ترحيل الإشعارات: ترحيل Cloudflare Worker اختياري لـ PushPlus وWxPusher وServerChan

## التطوير المحلي

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## النشر

تعمل خدمة Deno على Oracle Cloud ويتولى Caddy اتصالات HTTPS. تُحفظ الحسابات والجلسات والنتائج في Turso. ينشئ GitHub Actions حزم تثبيت Windows وAndroid عند دفع وسم إصدار.

[الاستضافة الذاتية](./deployment.md) · [Cloudflare Worker](./worker.md)

## الرخصة

هذا المشروع مرخّص بموجب [رخصة GNU Affero General Public License v3.0](../../LICENSE).

</div>
