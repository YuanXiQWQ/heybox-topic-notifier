<div dir="rtl" lang="he-IL" align="right">

# Worker לתיווך התראות

`notification-relay.js` הוא relay קל לשימוש עם Cloudflare Workers, והוא מספק רק:

- &rlm;`POST /pushplus` -> `https://www.pushplus.plus/send`
- &rlm;`POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- &rlm;`POST /serverchan` -> הממשק הרשמי של Server酱
- &rlm;`GET /healthz` בדיקת בריאות

הוא אינו מקבל URL יעד שרירותי, ולכן אי אפשר להשתמש בו כ-open proxy. נקודת הכניסה של Server酱 מקבלת רק
SendKey בטוח, ובונה את הכתובת הרשמית לפי הכללים הקיימים של הפרויקט.

## שלבי פריסה

1. צרו Worker חינמי ב-Cloudflare Workers.
2. הדביקו את תוכן `workers/notification-relay.js` בעורך ה-Worker, או פרסו את הסקריפט באמצעות Wrangler.
3. הוסיפו `RELAY_TOKEN` למשתנים/סודות של ה-Worker, והשתמשו במפתח אקראי ארוך כערך.
4. לאחר הפריסה, בקרו ב-`https://<your-worker>.workers.dev/healthz` ואשרו שמוחזר `{"status":"ok"}`.
5. הגדירו את Deno Deploy:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

צד הפרויקט ישלח את הדבר הבא רק כאשר כתובת השליחה של PushPlus, WxPusher או Server酱 שונתה לכתובת ה-relay:

<pre dir='ltr' align='left'><code class='language-http'>Authorization: Bearer &lt;NOTIFIER_RELAY_TOKEN&gt;
</code></pre>

ה-relay של Server酱 גם מעביר את ה-SendKey דרך כותרת בקשה ייעודית:

<pre dir='ltr' align='left'><code class='language-http'>X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;
</code></pre>

## בדיקת קונסול

אפשר לבדוק קודם בקונסולת ה-Worker או עם curl מקומי אם האימות פועל:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/pushplus" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"token":"&lt;pushplus-token&gt;","title":"relay test","content":"hello","template":"markdown"}'
</code></pre>

בדיקת WxPusher:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/wxpusher" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"spt":"&lt;wxpusher-spt&gt;","summary":"relay test","content":"hello","contentType":1}'
</code></pre>

בדיקת Server酱:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/serverchan" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
</code></pre>

</div>
