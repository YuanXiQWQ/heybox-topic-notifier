# Deployment

Oracle Cloud runs the Deno service behind Caddy. Turso stores accounts, sessions and matches. GitHub Actions builds the Windows and Android installers for release tags.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Environment Variables

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Use a separate database for a candidate. Once the previous poller has stopped, set `VM_POLLING_ENABLED=true` on the production instance and restart its service.

- Base defaults: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
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

Real Heybox topic fetching is the only active runtime data source. The default
`HEYBOX_SIGNATURE_MODE=app` uses the verified app API publish-time list. `web` is only kept as a
diagnostic fallback. New accounts start with polling disabled; fetching only begins after the account
turns on the "enable polling" setting on its settings page.

## Notification Relay

The VM saves new matches and their notification jobs together in Turso. Each channel retries temporary failures independently and pending jobs can resume after a restart. Test notifications exercise the selected channels without creating workspace records.

### Browser notifications

The application notification switch controls the current browser independently of
the email/Webhook selector. HTTPS and `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`,
and `WEB_PUSH_SUBJECT` (for example, `mailto:admin@example.com`) are required.
Run `deno task notifications:keys` once in a trusted terminal and store the private
key in deployment environment variables. This does not configure native Honor push.
If configuration is missing, the disabled switch shows an explanation in the notification row.
Initialization failures or a fifteen-second timeout show a retry button. Retry after
configuration or connectivity is restored. Initialization and retries only read state;
enabling the switch requests browser permission and creates the subscription.

Keep the VAPID key pair stable. After rotation, enable browser notifications again.
Subscriptions are bound to the account and login session; logout, revocation, and
expiry stop delivery. Enable notifications again after signing in as needed.
Disabling notifications also suppresses queued messages. Push service acceptance
does not prove display on the device; browser policy, permissions, and network
reachability still apply. Verify background reception in target browsers before relying on it.

### Webhook relay

If Oracle Cloud cannot directly access PushPlus, WxPusher, or ServerChan, you can deploy the free
Cloudflare Worker relays first. The repository's `workers/notification-relay.js` provides fixed
`/pushplus`, `/wxpusher`, and `/serverchan` forwarding endpoints and authenticates requests with
`Authorization: Bearer <token>`. See [worker.md](worker.md) for the full steps.

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
