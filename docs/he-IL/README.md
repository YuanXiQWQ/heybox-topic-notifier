<div dir="rtl" lang="he-IL" align="right">

# מודיע נושאי Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **עברית** |
|:-----------------------:|:---------:|

---

&rlm;<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
הוא יישום Deno קל לניטור פוסטים של נושאי Heybox. הוא קורא באופן תקופתי פוסטים אמיתיים של נושאים
בהתאם להגדרות של כל חשבון, בודק כותרות, גוף טקסט, תגובות ותשובות מול כללי מילות מפתח, מתעד התאמות
בתצוגות ממתינות והיסטוריה, ושולח התראות דרך הערוץ שהוגדר.

## תכונות

- לוח מחוונים: הצגת מצב הסריקה, סך כל ההתאמות, ההתאמה האחרונה וההתאמות הממתינות, עם פעולת בדיקה ידנית
- דף הגדרות: הגדרת מזהי נושאים, מצב הפעלה, הערות, יחידת מרווח הסריקה, מגבלת פוסטים, מצב מיון, שפת ממשק,
  מצב כהה וצבע ערכת נושא
- הגדרות חשבון: הרשמה, התחברות, התנתקות, עדכון שם משתמש ועדכון סיסמה; נתוני החשבון מבודדים לפי מזהה משתמש
- כללי מילות מפתח: תמיכה בכללים משותפים, כללים ייעודיים לנושא, מיקומי התאמה, רגישות לאותיות גדולות/קטנות
  וביטויים רגולריים
- טבלאות התאמות: רשומות ממתינות ורשומות היסטוריה תומכות בסינון לפי טווח זמן, עימוד, השלמה באצווה
  ופעולות מחיקה
- רשומות ניפוי שגיאות: התאמות מדומות ובדיקות התראה, עם מגבלות קצב בצד השרת עבור סריקה ידנית ופעולות ניפוי
- ערוצי התראה: Webhook מותאם אישית, ServerChan, PushPlus, WxPusher, API דוא"ל ו-SMTP
- ממסר התראות: ממסר Cloudflare Worker אופציונלי עבור PushPlus, WxPusher ו-ServerChan
- אבטחה: גיבובי סיסמה PBKDF2, סשנים מגובי KV, אסימוני CSRF, כותרות אבטחה, יומני ביקורת,
  ורשימת הרשאה יוצאת עם אימות DNS

## מחסנית טכנולוגית

- &rlm;Deno 2 + TypeScript
- &rlm;Hono
- &rlm;Deno KV
- &rlm;Deno.cron + מתזמן טיימר מקומי
- &rlm;HTML שמרונדר בצד השרת + JavaScript/CSS רגילים
- סקריפט Cloudflare Workers לממסר התראות

## פיתוח מקומי

הפעל את שרת הפיתוח:

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
</code></pre>

לאחר מכן פתח:

<pre dir='ltr' align='left'><code class='language-text'>http://localhost:8000
</code></pre>

כדי לעקוף את ברירות המחדל, השתמש ב-`.env.example` כהפניה והגדר את משתני הסביבה המתאימים בסביבת
הריצה שלך. רשום חשבון בביקור הראשון; משתני הסביבה רק מאתחלים ברירות מחדל עבור חשבונות חדשים או
נתוני ברירת מחדל, ולאחר מכן דף ההגדרות של כל חשבון הופך למקור האמת.

היישום מספק דפי הרשמה והתחברות. לכל חשבון יש הגדרות, היסטוריית התאמות, מצב סריקה ותצורת התראות
מבודדים, כך שמשתמשים החולקים את אותה כתובת פריסה אינם חולקים נתונים. סיסמאות משתמשים נשמרות
ב-Deno KV כגיבובי PBKDF2 עם salt, ולא כטקסט גלוי. סשני התחברות נשמרים ב-Deno KV, וקובץ ה-cookie
בדפדפן מכיל רק אסימון סשן אקראי. שינויים בהגדרות, בחשבון ובניפוי שגיאות מאמתים אסימון CSRF,
ופעולות רגישות מוגבלות בקצב בפריסות ציבוריות.

## פקודות

<pre dir='ltr' align='left'><code class='language-powershell'>deno task dev
deno task start
deno task check
deno task clear-seen
</code></pre>

`clear-seen` מנקה סמנים של פוסטים שכבר עובדו, כדי שאפשר יהיה לאמת שוב את אותם פוסטים; השתמש בו
בזהירות בסביבת ייצור.

## פריסה

ראה [deployment](./deployment.md) להגדרת Deno Deploy. נקודת הכניסה של היישום מוגדרת על ידי מקטע
`deploy` בתוך `deno.json`; GitHub Actions מריץ בדיקות בלבד ואינו פורס את היישום. נקודת הכניסה לפריסה
ב-`src/deploy.ts` מצהירה על Deno Deploy Cron, והסריקה בפועל פועלת רק ב-Production ובציר הזמן של ענף
Git בשם `dev`. ראה [worker](./worker.md) להגדרת Worker של ממסר ההתראות.

## רישיון

פרויקט זה מורשה תחת [GNU Affero General Public License v3.0](../../LICENSE).

</div>
