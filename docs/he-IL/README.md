<!-- GitHub 文档用 align 保持 RTL 对齐，代码块单独采用 LTR。 -->
<!--suppress HtmlDeprecatedAttribute -->
<div dir="rtl" lang="he-IL" align="right">

# מודיע נושאי Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **עברית** |
| :-------------------------: | :-------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

הוסיפו נושא של Heybox בהגדרות, בחרו מילות מפתח, ביטויים רגולריים או סינון בעזרת בינה מלאכותית, והפעילו בדיקה תקופתית. אפשר להעביר תוצאות להיסטוריה ולהחזיר אותן לסביבת העבודה.

לפתיחת חשבון נדרש קוד הזמנה. התראות היישום מופעלות בכל מכשיר בנפרד ואפשר לשלב אותן עם דואר אלקטרוני או Webhook. שינויים במצב לא מקוון מסתנכרנים עם חידוש החיבור. כברירת מחדל השפה והמצב הכהה נקבעים לפי המכשיר.

## תכונות

- לוח מחוונים: הצגת מצב הסריקה, סך כל ההתאמות, ההתאמה האחרונה וההתאמות הממתינות, עם פעולת בדיקה ידנית
- דף הגדרות: הגדרת מזהי נושאים, מצב הפעלה, הערות, יחידת מרווח הסריקה, מגבלת פוסטים, מצב מיון, שפת ממשק,
  מצב כהה וצבע ערכת נושא
- הגדרות חשבון: הרשמה, התחברות, התנתקות, עדכון שם משתמש ועדכון סיסמה; נתוני החשבון מבודדים לפי מזהה משתמש
- כללי מילות מפתח: תמיכה בכללים משותפים, כללים ייעודיים לנושא, מיקומי התאמה, רגישות לאותיות גדולות/קטנות
  וביטויים רגולריים
- הגדרות → הגדרות התראות → התראת בדיקה
- ערוצי התראה: Webhook מותאם אישית, ServerChan, PushPlus, WxPusher, API דוא"ל ו-SMTP
- ממסר התראות: ממסר Cloudflare Worker אופציונלי עבור PushPlus, WxPusher ו-ServerChan

## פיתוח מקומי

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## פריסה

שירות Deno פועל ב־Oracle Cloud עם Caddy עבור HTTPS. החשבונות, ההפעלות והתוצאות נשמרים ב־Turso. ‏GitHub Actions בונה חבילות התקנה ל־Windows ול־Android לפי תגיות גרסה.

[התקנה בשרת פרטי](./deployment.md) · [Cloudflare Worker](./worker.md)

## רישיון

פרויקט זה מורשה תחת [GNU Affero General Public License v3.0](../../LICENSE).

</div>
