# Deployment ہدایات

یہ project Deno Deploy کی GitHub integration استعمال کر کے deploy ہوتا ہے، اور app deploy کرنے کے لیے GitHub Actions استعمال نہیں کرتا۔ GitHub Actions صرف
`deno task check` چلاتا ہے، جبکہ repository میں push کے بعد app کو build اور route کرنے کی ذمہ داری Deno Deploy کی ہے۔

## Branch deployment

Deno Deploy ایک ہی App کے لیے مختلف timelines بناتا ہے:

- `main`: official release deployment، Production URL پر route ہوتا ہے
- `dev`: release سے پہلے test deployment، Git Branch / DEV URL پر route ہوتا ہے

جب موجودہ App کا نام `heybox-topic-notifier` ہو، تو URL convention تقریباً یہ ہے:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

موجودہ `dev` test deployment پہلے ہی بن چکا ہے، اور stable test entry Git Branch / DEV URL ہے۔ آئندہ `dev` پر push
test deployment update کرے گا، جبکہ `main` پر push Production update کرے گا۔

Deno Deploy کی GitHub integration feature branch push کے لیے Git Branch timeline اور Build بنا سکتی ہے۔ Preview
اور عام feature branches کو بار بار KV پڑھنے، Heybox fetch کرنے یا notification بھیجنے سے بچانے کے لیے، deployment entrypoint top level پر Cron declare کرتا ہے، مگر handler صرف اس وقت execution جاری رکھتا ہے جب
`DENO_TIMELINE=production` یا `DENO_TIMELINE=git-branch/dev` ہو۔ عام page requests، root path،
health check اور Warm up
requests automatic polling trigger نہیں کریں گے؛ frontend page پر ایک منٹ سے کم وقت والی due query controlled state API کے ذریعے current account scheduling trigger کرے گی۔

## Deno Deploy configuration

Deno Deploy App میں درج ذیل configuration برقرار رکھیں:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` میں deploy configuration deployment entrypoint کے لیے واحد repository-side configuration source ہے۔

## Database

Deno Deploy App سے Deno KV database bind ہے۔ Code `Deno.openKv()`
کے ذریعے accounts، settings، history، polling state اور processed-post markers read/write کرتا ہے۔ Account passwords salted PBKDF2 hashes کے طور پر محفوظ ہوتے ہیں؛ user data user
ID prefix کے مطابق isolated ہوتا ہے، اور Deno Deploy timeline کے مطابق Production اور Git Branch data کو بھی الگ کرتا ہے۔

## Runtime environment variables

Deno Deploy App میں ضرورت کے مطابق configure کریں۔ Repository root میں `.env.example` scenario کے مطابق ترتیب دیا گیا ہے: default میں صرف minimum usable configuration enabled ہے،
جبکہ دیگر polling tuning، notification channels، relay اور security allowlist configuration commented رہتی ہیں؛ جس scenario کو استعمال کرنا ہو، صرف اسی کی متعلقہ lines uncomment کریں۔

- Basic defaults: `APP_LOCALE`، `HEYBOX_TOPIC_ID`، `POLL_ENABLED`، `NOTIFIER_PROVIDER`
- Polling tuning: `POLL_INTERVAL_MINUTES`، `POLL_POST_LIMIT`، `POLL_SORT`
- Heybox request overrides: `HEYBOX_SIGNATURE_MODE`، `HEYBOX_DEVICE_ID`، `HEYBOX_COOKIE`، `HEYBOX_USER_AGENT`
- Common notification item: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notifications: `NOTIFIER_WEBHOOK_SERVICE`، `NOTIFIER_WEBHOOK_URL`،
  `NOTIFIER_PUSHPLUS_TOKEN`، `NOTIFIER_WXPUSHER_SPT`، `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notifications: `NOTIFIER_EMAIL_SERVICE`، `NOTIFIER_EMAIL_ADDRESS`، `NOTIFIER_EMAIL_FROM`،
  `NOTIFIER_EMAIL_API_URL`، `NOTIFIER_EMAIL_API_TOKEN`، `NOTIFIER_SMTP_HOST`،
  `NOTIFIER_SMTP_PORT`، `NOTIFIER_SMTP_SECURE`، `NOTIFIER_SMTP_USERNAME`، `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`، `NOTIFIER_WXPUSHER_SEND_URL`،
  `NOTIFIER_SERVER_CHAN_SEND_URL`، `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery custom Webhook، Email API اور SMTP targets validate کرتی ہے۔ Default طور پر صرف public HTTPS URL اور common SMTP
ports allowed ہیں؛ اگر self-hosted relay یا fixed mail service استعمال کرنا ہو، تو comma-separated `OUTBOUND_ALLOWED_HOSTS`
سے متعلقہ hosts کو explicitly allow کر سکتے ہیں، مثلاً `relay.example.com,smtp.example.com`۔
یہ variable set ہونے کے بعد notification outbound target کو list کے host یا `*.example.com` form والے wildcard سے match کرنا ہوگا۔

HTTP redirects ہر hop پر validate ہوتے ہیں، اور صرف same-origin redirects allowed ہیں۔ جب `OUTBOUND_ALLOWED_HOSTS` configured نہ ہو، تو target host کے DNS
A/AAAA resolution result کو بھی validate کیا جاتا ہے کہ وہ localhost، internal network، link-local، metadata service یا reserved address ranges میں نہ آئے۔ `OUTBOUND_ALLOWED_HOSTS`
administrator کی explicit trust boundary ہے؛ wildcard صرف مکمل طور پر controlled domains کے تحت configure ہونا چاہیے۔

App registration اور login pages فراہم کرتا ہے۔ Account information، login sessions، اور ہر account کی settings، match records، polling state، notification configuration
Deno KV میں stored ہوتی ہیں اور user ID کے مطابق isolated رہتی ہیں۔ Browser Cookie صرف random session token store کرتا ہے؛ server token
hash اور expiry time store کرتا ہے۔

Real Heybox topic fetching فی الحال واحد runtime data source ہے۔ Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list استعمال کرتا ہے؛ `web` صرف diagnostic fallback کے طور پر رکھا گیا ہے۔ `POLL_ENABLED`
صرف new account یا default account کے لیے initial polling switch ہے؛ حقیقت میں fetching ہوگی یا نہیں، یہ ہر account settings page میں “Enable polling” پر منحصر ہے۔

## Notification relay

اگر Deno Deploy براہ راست PushPlus، WxPusher یا Server酱 تک access نہیں کر سکتا، تو پہلے free Cloudflare Worker
relay deploy کیا جا سکتا ہے۔ Repository میں `workers/notification-relay.js` fixed طور پر `/pushplus`، `/wxpusher` اور `/serverchan`
تین forwarding entries فراہم کرتا ہے، اور authentication کے لیے `Authorization: Bearer <token>` استعمال کرتا ہے؛ مکمل steps کے لیے [worker.md](worker.md) دیکھیں۔

Deno Deploy-side configuration example:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verification

Deployment مکمل ہونے کے بعد visit کریں:

```text
/healthz
```

اگر `status: ok` return ہو تو اس کا مطلب ہے کہ service process start ہو چکا ہے، اور health check Deno KV read نہیں کرتا۔