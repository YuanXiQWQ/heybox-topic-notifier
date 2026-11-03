<div dir="rtl" lang="ur-PK" align="right">

Deno سروس Oracle Cloud پر چلتی ہے اور Caddy کے ذریعے HTTPS فراہم کیا جاتا ہے۔ اکاؤنٹس، سیشن اور نتائج Turso میں محفوظ ہوتے ہیں۔ GitHub Actions ریلیز ٹیگ سے Windows اور Android کے انسٹالر بناتا ہے۔

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Runtime environment variables

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

جانچ کے لیے الگ ڈیٹا بیس استعمال کریں۔ پرانے سرور پر وقفے وقفے سے جانچ بند کرنے کے بعد اصل سرور پر `VM_POLLING_ENABLED=true` مقرر کریں اور سروس دوبارہ چلائیں۔

- &rlm;Basic defaults: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `NOTIFIER_PROVIDER`
- &rlm;Polling tuning: `POLL_INTERVAL_MINUTES`، `POLL_POST_LIMIT`، `POLL_SORT`
- &rlm;Heybox request overrides: `HEYBOX_SIGNATURE_MODE`، `HEYBOX_DEVICE_ID`، `HEYBOX_COOKIE`، `HEYBOX_USER_AGENT`
- &rlm;Common notification item: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- &rlm;Webhook notifications: `NOTIFIER_WEBHOOK_SERVICE`، `NOTIFIER_WEBHOOK_URL`،
  `NOTIFIER_PUSHPLUS_TOKEN`، `NOTIFIER_WXPUSHER_SPT`، `NOTIFIER_SERVER_CHAN_SEND_KEY`
- &rlm;Email notifications: `NOTIFIER_EMAIL_SERVICE`، `NOTIFIER_EMAIL_ADDRESS`، `NOTIFIER_EMAIL_FROM`،
  `NOTIFIER_EMAIL_API_URL`، `NOTIFIER_EMAIL_API_TOKEN`، `NOTIFIER_SMTP_HOST`،
  `NOTIFIER_SMTP_PORT`، `NOTIFIER_SMTP_SECURE`، `NOTIFIER_SMTP_USERNAME`، `NOTIFIER_SMTP_PASSWORD`
- &rlm;Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`، `NOTIFIER_WXPUSHER_SEND_URL`،
  `NOTIFIER_SERVER_CHAN_SEND_URL`، `NOTIFIER_RELAY_TOKEN`
- &rlm;Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery custom Webhook، Email API اور SMTP targets validate کرتی ہے۔ Default طور پر صرف public HTTPS URL اور common SMTP
ports allowed ہیں؛ اگر self-hosted relay یا fixed mail service استعمال کرنا ہو، تو comma-separated `OUTBOUND_ALLOWED_HOSTS`
سے متعلقہ hosts کو explicitly allow کر سکتے ہیں، مثلاً `relay.example.com,smtp.example.com`۔
یہ variable set ہونے کے بعد notification outbound target کو list کے host یا `*.example.com` form والے wildcard سے match کرنا ہوگا۔

HTTP redirects ہر hop پر validate ہوتے ہیں، اور صرف same-origin redirects allowed ہیں۔ جب `OUTBOUND_ALLOWED_HOSTS` configured نہ ہو، تو target host کے DNS
A/AAAA resolution result کو بھی validate کیا جاتا ہے کہ وہ localhost، internal network، link-local، metadata service یا reserved address ranges میں نہ آئے۔ `OUTBOUND_ALLOWED_HOSTS`
administrator کی explicit trust boundary ہے؛ wildcard صرف مکمل طور پر controlled domains کے تحت configure ہونا چاہیے۔

Real Heybox topic fetching فی الحال واحد runtime data source ہے۔ Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list استعمال کرتا ہے؛ `web` صرف diagnostic fallback کے طور پر رکھا گیا ہے۔
نئے account polling بند حالت میں شروع ہوتے ہیں اور اپنے settings page میں “Enable polling” آن کرنے کے بعد ہی fetching کرتے ہیں۔

## Notification relay

اگر Oracle Cloud براہ راست PushPlus، WxPusher یا Server酱 تک access نہیں کر سکتا، تو پہلے free Cloudflare Worker
relay deploy کیا جا سکتا ہے۔ Repository میں `workers/notification-relay.js` fixed طور پر `/pushplus`، `/wxpusher` اور `/serverchan`
تین forwarding entries فراہم کرتا ہے، اور authentication کے لیے `Authorization: Bearer <token>` استعمال کرتا ہے؛ مکمل steps کے لیے [worker.md](worker.md) دیکھیں۔

Oracle Cloud-side configuration example:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

## Verification

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
