# Deployment

This project uses Deno Deploy's GitHub integration for application deployment. GitHub Actions only
runs `deno task check`; Deno Deploy builds and routes the application after repository pushes.

## Branch Deployments

Deno Deploy creates separate timelines for the same app:

- `main`: release deployment routed to the Production URL
- `dev`: pre-release test deployment routed to the Git Branch / DEV URL

When the app is named `heybox-topic-notifier`, the URL convention is:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

The `dev` test deployment is already established. Its stable test entry is the Git Branch / DEV URL.
Future pushes to `dev` update the test deployment, while pushes to `main` update Production.

Deno Deploy's GitHub integration may create Git Branch timelines and builds for feature branch
pushes. To avoid duplicate KV reads, Heybox fetches, or notifications from previews and ordinary
feature branches, the deploy entrypoint declares the Cron at the top level, but the handler only
continues when `DENO_TIMELINE=production` or `DENO_TIMELINE=git-branch/dev`. Ordinary page requests,
the root path, health checks, and warm-up requests do not trigger automatic polling. Frontend checks
for sub-minute polling use a controlled state endpoint to schedule the current account.

## Deno Deploy Configuration

Keep the following settings in the Deno Deploy app:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

The `deploy` section in `deno.json` is the only repository configuration source for the deployment
entrypoint.

## Database

The Deno Deploy app is bound to a Deno KV database. The code uses `Deno.openKv()` to read and write
accounts, settings, history records, polling state, and processed-post markers. Account passwords
are stored as salted PBKDF2 hashes. User data is isolated by user ID prefix, and Deno Deploy also
isolates Production and Git Branch data by timeline.

## Environment Variables

Configure values in the Deno Deploy app only as needed. The repository root `.env.example` is
grouped by scenario: only the minimal safe configuration is enabled by default, and polling tweaks,
notification channels, relay settings, and outbound allowlists stay commented until used.

- Base defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
- Polling tweaks: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox request overrides: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`,
  `HEYBOX_USER_AGENT`
- Notification common setting: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notifications: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notifications: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`, `NOTIFIER_SMTP_PORT`,
  `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery validates custom Webhook, Email API, and SMTP targets. By default, only public
HTTPS URLs and common SMTP ports are allowed. If you need to use a self-hosted relay or a fixed mail
service, explicitly allow the host with the comma-separated `OUTBOUND_ALLOWED_HOSTS` value, such as
`relay.example.com,smtp.example.com`. After this variable is set, outbound notification targets must
match a listed host or a wildcard pattern such as `*.example.com`.

HTTP redirects are validated hop by hop, and only same-origin redirects are allowed. When
`OUTBOUND_ALLOWED_HOSTS` is not configured, the app also checks the target host's DNS A/AAAA results
and rejects local, private, link-local, metadata-service, and reserved address ranges.
`OUTBOUND_ALLOWED_HOSTS` is an explicit administrator trust boundary. Only configure wildcards under
domains you fully control.

The app provides registration and login pages. Account information, login sessions, and each
account's settings, match records, polling state, and notification configuration are stored in Deno
KV and isolated by user ID. Browser cookies only store random session tokens; the server stores
token hashes and expiration times.

Real Heybox topic fetching is the only active runtime data source. The default
`HEYBOX_SIGNATURE_MODE=app` uses the verified app API publish-time list. `web` is only kept as a
diagnostic fallback. `POLL_ENABLED` only seeds the initial polling switch for new or default
accounts. Actual fetching is controlled by the "enable polling" setting on each account's settings
page.

## Notification Relay

If Deno Deploy cannot directly access PushPlus, WxPusher, or ServerChan, you can deploy the free
Cloudflare Worker relay first. The repository's `workers/notification-relay.js` provides fixed
`/pushplus`, `/wxpusher`, and `/serverchan` forwarding endpoints and authenticates requests with
`Authorization: Bearer <token>`. See [worker.md](worker.md) for the full steps.

Deno Deploy configuration example:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verification

After deployment, visit:

```text
/healthz
```

`status: ok` means the service process has started, and the health check does not read Deno KV.
