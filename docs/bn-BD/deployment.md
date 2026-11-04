# ডিপ্লয়মেন্ট নির্দেশনা

Deno পরিষেবা Oracle Cloud-এ চলে, আর Caddy HTTPS পরিচালনা করে। অ্যাকাউন্ট, সেশন ও ফলাফল Turso-তে থাকে। রিলিজ ট্যাগ থেকে GitHub Actions Windows ও Android ইনস্টলার তৈরি করে।

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

পরীক্ষার জন্য আলাদা ডেটাবেস ব্যবহার করুন। পুরোনো সার্ভারের নিয়মিত পরীক্ষা বন্ধ করার পর প্রোডাকশন সার্ভারে `VM_POLLING_ENABLED=true` সেট করে পরিষেবা পুনরায় চালু করুন।

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Polling tuning: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox request override: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Common notification option: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notification: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notification: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery custom Webhook, Email API এবং SMTP target validate করে। Default-এ শুধু public HTTPS URL এবং common SMTP
port অনুমোদিত; self-hosted relay বা fixed mail service ব্যবহার করতে হলে comma-separated `OUTBOUND_ALLOWED_HOSTS`
দিয়ে সংশ্লিষ্ট host explicit allow করতে পারেন, যেমন `relay.example.com,smtp.example.com`।
এই variable সেট করার পর notification outbound target-কে list-এর host অথবা `*.example.com` wildcard form-এর সঙ্গে match করতে হবে।

HTTP redirect প্রতিটি hop-এ validate করা হয় এবং শুধু same-origin redirect অনুমোদিত; `OUTBOUND_ALLOWED_HOSTS` configure না থাকলে target host-এর DNS
A/AAAA result-ও পরীক্ষা করা হয়, যাতে তা localhost, private network, link-local, metadata service অথবা reserved address range-এ না পড়ে। `OUTBOUND_ALLOWED_HOSTS`
administrator-এর explicit trust boundary; wildcard শুধু সম্পূর্ণ নিয়ন্ত্রিত domain-এর অধীনে configure করা উচিত।

Real Heybox topic fetching বর্তমানে একমাত্র runtime data source। Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list ব্যবহার করে; `web` শুধু diagnostic fallback হিসেবে রাখা হয়েছে।
নতুন account polling বন্ধ অবস্থায় শুরু হয় এবং নিজের settings page-এ “enable polling” চালু করার পরেই fetch করে।

## Notification relay

Oracle Cloud যদি PushPlus, WxPusher অথবা Server酱-এ সরাসরি access করতে না পারে, তাহলে আগে free Cloudflare Worker
relay deploy করতে পারেন। Repository-এর `workers/notification-relay.js` fixed `/pushplus`, `/wxpusher` এবং `/serverchan`
তিনটি forwarding entry প্রদান করে এবং `Authorization: Bearer <token>` authentication ব্যবহার করে; complete steps-এর জন্য [worker.md](worker.md) দেখুন।

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verification

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
