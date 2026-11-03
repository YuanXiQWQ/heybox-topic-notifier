# Deployment निर्देश

Deno सेवा Oracle Cloud पर चलती है और Caddy HTTPS संभालता है। खाते, सत्र और परिणाम Turso में सहेजे जाते हैं। रिलीज़ टैग से GitHub Actions Windows और Android के इंस्टॉलर बनाता है।

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

परीक्षण के लिए अलग डेटाबेस रखें। पुराने सर्वर की नियमित जाँच बंद करने के बाद प्रोडक्शन सर्वर पर `VM_POLLING_ENABLED=true` सेट करें और सेवा फिर से शुरू करें।

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Polling tuning: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox request overrides: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Common notification item: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notification: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notification: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery custom Webhook, Email API और SMTP targets validate करता है। Default रूप से केवल public HTTPS URL और common SMTP
ports allowed हैं; यदि self-hosted relay या fixed mail service का उपयोग करना हो, तो comma-separated `OUTBOUND_ALLOWED_HOSTS`
से संबंधित hosts को explicitly allow कर सकते हैं, जैसे `relay.example.com,smtp.example.com`।
यह variable set होने के बाद notification outbound target को list के host या `*.example.com` form वाले wildcard से match करना होगा।

HTTP redirects hop-by-hop validate होते हैं, और केवल same-origin redirects allowed हैं। जब `OUTBOUND_ALLOWED_HOSTS` configured नहीं है, तब target host के DNS
A/AAAA resolution result को भी validate किया जाता है कि वह localhost, private network, link-local, metadata service या reserved address ranges में न पड़े। `OUTBOUND_ALLOWED_HOSTS`
administrator की explicit trust boundary है; wildcard केवल पूरी तरह controlled domains के अंतर्गत configure करना चाहिए।

Real Heybox topic fetching वर्तमान में एकमात्र runtime data source है। Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list का उपयोग करता है; `web` केवल diagnostic fallback के रूप में रखा गया है।
नए account polling बंद के साथ शुरू होते हैं और अपने settings page में “enable polling” चालू करने के बाद ही fetching करते हैं।

## Notification relay

यदि Oracle Cloud सीधे PushPlus, WxPusher या Server酱 access नहीं कर सकता, तो पहले free Cloudflare Worker
relay deploy किया जा सकता है। Repository का `workers/notification-relay.js` fixed `/pushplus`, `/wxpusher` और `/serverchan`
तीन forwarding entries प्रदान करता है, और `Authorization: Bearer <token>` authentication का उपयोग करता है; complete steps के लिए [worker.md](worker.md) देखें।

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
