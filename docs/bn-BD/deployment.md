# ডিপ্লয়মেন্ট নির্দেশনা

এই প্রকল্পটি Deno Deploy-এর GitHub integration ব্যবহার করে deploy করা হয়; অ্যাপ deploy করার জন্য GitHub Actions ব্যবহার করা হয় না। GitHub Actions শুধু
`deno task check` চালায়, আর repository-তে push হওয়ার পর Deno Deploy অ্যাপ build ও route করার দায়িত্ব নেয়।

## Branch deployment

Deno Deploy একই App-এর জন্য আলাদা timeline তৈরি করে:

- `main`: official release deployment, Production URL-এ route হয়
- `dev`: release-এর আগে test deployment, Git Branch / DEV URL-এ route হয়

বর্তমান App-এর নাম `heybox-topic-notifier` হলে URL convention প্রায় এমন:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

বর্তমান `dev` test deployment তৈরি করা হয়েছে, এবং stable test entry হলো Git Branch / DEV URL। পরবর্তী push `dev`-এ গেলে
test deployment update হবে, আর `main`-এ push করলে Production update হবে।

Deno Deploy-এর GitHub integration feature branch push-এর জন্য Git Branch timeline এবং Build তৈরি করতে পারে। Preview
এবং সাধারণ feature branch যেন বারবার KV পড়া, Heybox fetch করা বা notification পাঠানো না করে, সে জন্য deployment entrypoint top level-এ Cron declare করে, কিন্তু handler শুধু
`DENO_TIMELINE=production` অথবা `DENO_TIMELINE=git-branch/dev` হলে execution চালিয়ে যায়। সাধারণ page request, root path,
health check এবং Warm up
request automatic polling trigger করবে না; frontend page-এ এক মিনিটের কম সময়ের due query controlled state API দিয়ে বর্তমান account scheduling trigger করবে।

## Deno Deploy configuration

Deno Deploy App-এ নিচের configuration বজায় রাখুন:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json`-এর deploy configuration হলো deployment entrypoint-এর একমাত্র repository-side configuration source।

## Database

Deno Deploy App-এ Deno KV database bind করা আছে। Code `Deno.openKv()`
ব্যবহার করে account, settings, history, polling state এবং processed post marker read/write করে। Account password salted PBKDF2 hash হিসেবে সংরক্ষিত হয়; user data user
ID prefix অনুযায়ী isolated থাকে, এবং Deno Deploy timeline অনুযায়ী Production ও Git Branch data-ও আলাদা রাখে।

## Runtime environment variables

Deno Deploy App-এ প্রয়োজন অনুযায়ী configure করুন। Repository root-এর `.env.example` scenario অনুযায়ী সাজানো হয়েছে: default-এ শুধু minimum usable configuration enabled থাকে,
আর polling tuning, notification channel, relay এবং security allowlist configuration comment অবস্থায় থাকে; যে scenario ব্যবহার করবেন, শুধু সংশ্লিষ্ট line uncomment করুন।

- Basic defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

App registration এবং login page দেয়। Account information, login session, এবং প্রতিটি account-এর settings, match records, polling state, notification configuration
Deno KV-তে stored থাকে এবং user ID অনুযায়ী isolated থাকে। Browser Cookie শুধু random session token রাখে; server token
hash এবং expiry time রাখে।

Real Heybox topic fetching বর্তমানে একমাত্র runtime data source। Default `HEYBOX_SIGNATURE_MODE=app` verified App API
publish-time list ব্যবহার করে; `web` শুধু diagnostic fallback হিসেবে রাখা হয়েছে। `POLL_ENABLED`
শুধু new account বা default account-এর initial polling switch; আসলে fetch হবে কি না, তা প্রতিটি account settings page-এর “enable polling” অনুযায়ী নির্ধারিত হয়।

## Notification relay

Deno Deploy যদি PushPlus, WxPusher অথবা Server酱-এ সরাসরি access করতে না পারে, তাহলে আগে free Cloudflare Worker
relay deploy করতে পারেন। Repository-এর `workers/notification-relay.js` fixed `/pushplus`, `/wxpusher` এবং `/serverchan`
তিনটি forwarding entry প্রদান করে এবং `Authorization: Bearer <token>` authentication ব্যবহার করে; complete steps-এর জন্য [worker.md](worker.md) দেখুন।

Deno Deploy-side configuration example:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verification

Deployment সম্পন্ন হলে visit করুন:

```text
/healthz
```

`status: ok` return করলে বোঝায় service process started হয়েছে এবং health check Deno KV পড়ে না।