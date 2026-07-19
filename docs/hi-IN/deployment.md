# Deployment निर्देश

यह project Deno Deploy के GitHub integration से deploy होता है, और app deploy करने के लिए GitHub Actions का उपयोग नहीं करता। GitHub Actions केवल
`deno task check` चलाता है; repository में push होने के बाद Deno Deploy app को build और route करता है।

## Branch deployment

Deno Deploy एक ही App के लिए अलग-अलग timelines बनाता है:

- `main`: official release deployment, Production URL पर route होता है
- `dev`: release से पहले का test deployment, Git Branch / DEV URL पर route होता है

जब मौजूदा App का नाम `heybox-topic-notifier` हो, तो URL convention लगभग यह है:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

मौजूदा `dev` test deployment बन चुका है, और stable test entry Git Branch / DEV URL है। आगे `dev` पर push
test deployment update करेगा, और `main` पर push Production update करेगा।

Deno Deploy का GitHub integration feature branch push के लिए Git Branch timeline और Build बना सकता है। Preview
और सामान्य feature branches को बार-बार KV पढ़ने, Heybox fetch करने या notification भेजने से बचाने के लिए, deployment entrypoint top level पर Cron declare करता है, लेकिन handler केवल तब आगे execution जारी रखेगा जब
`DENO_TIMELINE=production` या `DENO_TIMELINE=git-branch/dev` हो। सामान्य page requests, root path,
health check और Warm up
requests automatic polling trigger नहीं करेंगे; frontend page पर एक minute से कम की due-time query controlled state API के माध्यम से current account scheduling trigger करेगी।

## Deno Deploy configuration

Deno Deploy App में निम्न configuration बनाए रखें:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` में deploy configuration deployment entrypoint के लिए एकमात्र repository-side configuration source है।

## Database

Deno Deploy App से Deno KV database bound है। Code `Deno.openKv()`
का उपयोग करके accounts, settings, history, polling state और processed-post markers read/write करता है। Account passwords salted PBKDF2 hashes के रूप में stored हैं; user data user
ID prefix के अनुसार isolated है, और Deno Deploy timeline के अनुसार Production और Git Branch data को भी अलग रखता है।

## Runtime environment variables

Deno Deploy App में ज़रूरत के अनुसार configure करें। Repository root में `.env.example` scenario के अनुसार व्यवस्थित है: default में केवल minimum usable configuration enabled है,
जबकि अन्य polling tuning, notification channel, relay और security allowlist configuration commented रहते हैं; जिस scenario का उपयोग करना हो, उसी की संबंधित lines uncomment करें।

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

App registration और login pages प्रदान करता है। Account information, login sessions, और प्रत्येक account की settings, match records, polling state, notification configuration
Deno KV में stored रहती हैं और user ID के अनुसार isolated रहती हैं। Browser Cookie केवल random session token store करता है; server token
hash और expiry time store करता है।

Real Heybox topic fetching वर्तमान में एकमात्र runtime data source है। Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list का उपयोग करता है; `web` केवल diagnostic fallback के रूप में रखा गया है। `POLL_ENABLED`
केवल new account या default account के लिए initial polling switch है; वास्तविक fetching होगी या नहीं, यह प्रत्येक account settings page में “enable polling” पर निर्भर करता है।

## Notification relay

यदि Deno Deploy सीधे PushPlus, WxPusher या Server酱 access नहीं कर सकता, तो पहले free Cloudflare Worker
relay deploy किया जा सकता है। Repository का `workers/notification-relay.js` fixed `/pushplus`, `/wxpusher` और `/serverchan`
तीन forwarding entries प्रदान करता है, और `Authorization: Bearer <token>` authentication का उपयोग करता है; complete steps के लिए [worker.md](worker.md) देखें।

Deno Deploy-side configuration example:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verification

Deployment पूरा होने के बाद visit करें:

```text
/healthz
```

`status: ok` return होने का अर्थ है कि service process start हो चुका है, और health check Deno KV read नहीं करता।