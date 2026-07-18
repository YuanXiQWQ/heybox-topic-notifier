# Worker לתיווך התראות

`notification-relay.js` הוא relay קל לשימוש עם Cloudflare Workers, והוא מספק רק:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> הממשק הרשמי של Server酱
- `GET /healthz` בדיקת בריאות

הוא אינו מקבל URL יעד שרירותי, ולכן אי אפשר להשתמש בו כ-open proxy. נקודת הכניסה של Server酱 מקבלת רק
SendKey בטוח, ובונה את הכתובת הרשמית לפי הכללים הקיימים של הפרויקט.

## שלבי פריסה

1. צרו Worker חינמי ב-Cloudflare Workers.
2. הדביקו את תוכן `workers/notification-relay.js` בעורך ה-Worker, או פרסו את הסקריפט באמצעות Wrangler.
3. הוסיפו `RELAY_TOKEN` למשתנים/סודות של ה-Worker, והשתמשו במפתח אקראי ארוך כערך.
4. לאחר הפריסה, בקרו ב-`https://<your-worker>.workers.dev/healthz` ואשרו שמוחזר `{"status":"ok"}`.
5. הגדירו את Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

צד הפרויקט ישלח את הדבר הבא רק כאשר כתובת השליחה של PushPlus, WxPusher או Server酱 שונתה לכתובת ה-relay:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

ה-relay של Server酱 גם מעביר את ה-SendKey דרך כותרת בקשה ייעודית:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## בדיקת קונסול

אפשר לבדוק קודם בקונסולת ה-Worker או עם curl מקומי אם האימות פועל:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

בדיקת WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

בדיקת Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```