<div dir="rtl" lang="he-IL" align="right">

שירות Deno פועל ב־Oracle Cloud עם Caddy עבור HTTPS. החשבונות, ההפעלות והתוצאות נשמרים ב־Turso. ‏GitHub Actions בונה חבילות התקנה ל־Windows ול־Android לפי תגיות גרסה.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## משתני סביבת ריצה

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

לבדיקות יש להשתמש במסד נתונים נפרד. לאחר עצירת הבדיקה התקופתית בשרת הישן, הגדירו `VM_POLLING_ENABLED=true` בשרת הייצור והפעילו את השירות מחדש.

- ערכי ברירת מחדל בסיסיים: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
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

שליפת נושאי Heybox אמיתיים היא כרגע מקור נתוני הריצה היחיד. כברירת מחדל `HEYBOX_SIGNATURE_MODE=app` משתמש ברשימת זמני פרסום מאומתת של App API;
`web` נשמר רק כ-fallback אבחוני.
חשבונות חדשים מתחילים עם polling מושבת, והם שולפים נתונים רק לאחר הפעלת “Enable polling” בדף ההגדרות שלהם.

## Relay להתראות

אם Oracle Cloud אינו יכול לגשת ישירות אל PushPlus, WxPusher או Server酱, ניתן לפרוס תחילה Cloudflare Worker חינמי
כ-relay. הקובץ `workers/notification-relay.js` במאגר מספק באופן קבוע שלוש כניסות העברה: `/pushplus`, `/wxpusher` ו-`/serverchan`,
ומשתמש ב-`Authorization: Bearer <token>` לאימות; ראו את השלבים המלאים ב-[worker.md](worker.md).

דוגמת הגדרה בצד Oracle Cloud:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## אימות

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
