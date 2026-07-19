<div dir="rtl" lang="he-IL" align="right">

# הוראות פריסה

הפרויקט הזה נפרס באמצעות שילוב GitHub של Deno Deploy, ואינו משתמש ב-GitHub Actions לפריסת היישום. GitHub Actions אחראי רק להרצת
`deno task check`, ו-Deno Deploy אחראי לבנייה ולניתוב של היישום לאחר push למאגר.

## פריסת ענפים

Deno Deploy יוצר timelines שונים עבור אותה App:

- &rlm;`main`: פריסת גרסה רשמית, מנותבת אל Production URL
- &rlm;`dev`: פריסת בדיקה לפני פרסום, מנותבת אל Git Branch / DEV URL

כאשר שם ה-App הנוכחי הוא `heybox-topic-notifier`, מוסכמת ה-URL היא בערך:

<pre dir='ltr' align='left'><code class='language-text'>https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
</code></pre>

פריסת הבדיקה הנוכחית של `dev` כבר נוצרה, ונקודת הכניסה היציבה לבדיקה היא Git Branch / DEV URL. push עתידי אל `dev`
יפעיל עדכון של פריסת הבדיקה, ו-push אל `main` יפעיל עדכון Production.

שילוב GitHub של Deno Deploy עשוי ליצור Git Branch timelines ו-Builds עבור push לענפי פיצ'ר. כדי למנוע מ-Preview
ומענפי פיצ'ר רגילים לקרוא KV, למשוך נתונים מ-Heybox או לשלוח התראות שוב ושוב, נקודת הכניסה לפריסה מצהירה על Cron ברמה העליונה, אך ה-handler ימשיך לרוץ רק כאשר
`DENO_TIMELINE=production` או `DENO_TIMELINE=git-branch/dev`. בקשות דף רגילות, נתיב השורש,
בדיקות בריאות ובקשות Warm up
לא יפעילו polling אוטומטי; בדיקות מועד קרוב בדף הקדמי, בטווח של פחות מדקה, יפעילו תזמון עבור החשבון הנוכחי דרך ממשק מצב מבוקר.

## הגדרת Deno Deploy

שמרו על ההגדרות הבאות ב-Deno Deploy App:

- &rlm;Repository: `YuanXiQWQ/heybox-topic-notifier`
- &rlm;App Directory: root directory
- &rlm;Entrypoint: `./src/deploy.ts`
- &rlm;Config Source: `deno.json deploy section`

הגדרת deploy בתוך `deno.json` היא מקור הגדרות המאגר היחיד עבור נקודת הכניסה לפריסה.

## מסד נתונים

Deno Deploy App כבר מקושר למסד נתונים Deno KV. הקוד משתמש ב-`Deno.openKv()`
כדי לקרוא ולכתוב חשבונות, הגדרות, היסטוריה, מצב polling וסימוני פוסטים שעובדו. סיסמאות חשבון נשמרות כגיבובי PBKDF2 עם salt; נתוני משתמש מבודדים לפי קידומת user
ID, ו-Deno Deploy גם מפריד נתוני Production ו-Git Branch לפי timeline.

## משתני סביבת ריצה

הגדירו אותם ב-Deno Deploy App לפי הצורך. הקובץ `.env.example` בשורש המאגר מאורגן לפי תרחישים: כברירת מחדל מופעלת רק ההגדרה המינימלית השימושית,
ושאר הגדרות כוונון polling, ערוצי התראות, relay ו-security allowlist נשארות בהערה; בטלו הערה רק לשורות המתאימות לתרחיש שבו משתמשים.

- ערכי ברירת מחדל בסיסיים: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
- כוונון polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- עקיפת בקשות Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- פריטי התראה כלליים: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- התראות Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- התראות דוא"ל: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- &rlm;Relay להתראות: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- רשימת הרשאה יוצאת לאבטחה: `OUTBOUND_ALLOWED_HOSTS`

מסירת התראות מאמתת יעדים של Webhook מותאם אישית, Email API ו-SMTP. כברירת מחדל מותרים רק URL ציבוריים ב-HTTPS ופורטות SMTP
נפוצות; אם צריך להשתמש ב-relay באחסון עצמי או בשירות דואר קבוע, אפשר להשתמש ב-`OUTBOUND_ALLOWED_HOSTS` מופרד בפסיקים
כדי לאשר במפורש את המארחים המתאימים, למשל `relay.example.com,smtp.example.com`.
לאחר הגדרת משתנה זה, יעד ההתראה היוצאת חייב להתאים למארח ברשימה או לתו כללי בצורה `*.example.com`.

HTTP redirects מאומתים בכל hop, ומותרות רק הפניות same-origin. כאשר `OUTBOUND_ALLOWED_HOSTS` אינו מוגדר, נבדק גם שתוצאות DNS
A/AAAA של מארח היעד אינן נופלות בטווחי localhost, רשת פנימית, link-local, שירות metadata או כתובות שמורות. `OUTBOUND_ALLOWED_HOSTS`
הוא גבול אמון מפורש שמגדיר מנהל המערכת; תווים כלליים יש להגדיר רק תחת דומיינים שנמצאים בשליטה מלאה.

היישום מספק דפי הרשמה והתחברות. פרטי חשבון, סשני התחברות, וכן ההגדרות, רשומות ההתאמה, מצב ה-polling ותצורת ההתראות של כל חשבון נשמרים ב-
Deno KV ומבודדים לפי user ID. ה-Browser Cookie שומר רק session token אקראי; השרת שומר hash של token
וזמן תפוגה.

שליפת נושאי Heybox אמיתיים היא כרגע מקור נתוני הריצה היחיד. כברירת מחדל `HEYBOX_SIGNATURE_MODE=app` משתמש ברשימת זמני פרסום מאומתת של App API;
`web` נשמר רק כ-fallback אבחוני. `POLL_ENABLED`
משמש רק כמתג polling התחלתי עבור חשבונות חדשים או חשבון ברירת מחדל; אם השליפה מתבצעת בפועל נקבע לפי “Enable polling” בדף ההגדרות של כל חשבון.

## Relay להתראות

אם Deno Deploy אינו יכול לגשת ישירות אל PushPlus, WxPusher או Server酱, ניתן לפרוס תחילה Cloudflare Worker חינמי
כ-relay. הקובץ `workers/notification-relay.js` במאגר מספק באופן קבוע שלוש כניסות העברה: `/pushplus`, `/wxpusher` ו-`/serverchan`,
ומשתמש ב-`Authorization: Bearer <token>` לאימות; ראו את השלבים המלאים ב-[worker.md](worker.md).

דוגמת הגדרה בצד Deno Deploy:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## אימות

לאחר השלמת הפריסה, בקרו ב:

<pre dir='ltr' align='left'><code class='language-text'>/healthz
</code></pre>

החזרת `status: ok` פירושה שתהליך השירות התחיל, ובדיקת הבריאות אינה קוראת את Deno KV.

</div>
