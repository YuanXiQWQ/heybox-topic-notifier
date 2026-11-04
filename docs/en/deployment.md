# Deployment

Oracle Cloud runs the Deno service behind Caddy. Turso stores accounts, sessions and matches. GitHub Actions builds the Windows and Android installers for release tags.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Automatic deployment from version tags

Pushes to `dev` and `main` run checks without deploying production. Push a stable version tag such as `3.13.2` or `v3.13.2` to run the release checks, build both clients and publish the complete Release. Oracle checks public releases every five minutes and deploys the exact tagged commit only after its tag-triggered release workflow succeeds and all four installer/update assets are available. Drafts, prereleases, incomplete releases and older versions are excluded.

The website and online pages inside the apps update with the server deployment. Native Windows and Android code updates through installers from the same tag. Clients that have not upgraded still require compatibility.

The server needs Deno, Git, Python 3, curl, tar and flock. Configure the application service and environment below, then install these tools from a verified project checkout:

```sh
sudo install -d -m 0755 /usr/local/lib/heybox-deploy
sudo install -m 0644 ops/auto_deploy.ts ops/deploy.sh /usr/local/lib/heybox-deploy/
sudo install -m 0644 ops/heybox-auto-deploy.service ops/heybox-auto-deploy.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/systemd/system/heybox-topic-notifier.service.d
printf '[Service]\nEnvironmentFile=-/opt/heybox-topic-notifier/current/.deploy.env\n' | sudo tee /etc/systemd/system/heybox-topic-notifier.service.d/release.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now heybox-auto-deploy.timer
sudo systemctl start heybox-auto-deploy.service
```

The first run deploys the latest ready stable release. Public GitHub API reads require neither a GitHub write token nor a server SSH private key stored in GitHub. Deployment tools are installed separately; application releases do not automatically replace tools running with administrator privileges.

Deployment verifies the archive digest and tagged commit, caches runtime dependencies, switches the release directory and checks the public HTTPS endpoint's running commit, navigation markup and static asset hashes. Failure restores the previous application directory and checks service health without restoring old account data or configuration. `/var/lib/heybox-deploy/state.json` records the last attempt. A failed or interrupted attempt is not repeatedly deployed; fix its cause and rerun that tag's GitHub release workflow to allow another attempt. Downloads and temporary archives are removed after use; release directories remain available for rollback.

```sh
systemctl list-timers heybox-auto-deploy.timer
journalctl -u heybox-auto-deploy.service -n 60 --no-pager
curl --fail --silent https://YOUR_DOMAIN/healthz
```

For releases supporting the application deployment identity, the health response's `deploymentId` must match the tag's full commit SHA. Earlier releases may still return `local`; the deployer verifies their running process directory and public asset hashes instead. The current tag and SHA are also recorded in `/var/lib/heybox-deploy/state.json`. Use `sudo systemctl stop heybox-auto-deploy.timer` to pause automatic checks and `sudo systemctl start heybox-auto-deploy.timer` to resume them. Stopping the timer does not interrupt an active deployment.

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

## Independent Heybox detail service

When a self-hosted server can read topic feeds but detail requests repeatedly return `show_captcha`, use a separately verified network location for details. Scheduling, accounts, Turso, AI matching and notifications remain in the main service.

Run [`src/detail_relay.ts`](../../src/detail_relay.ts) with `deno task start:detail-relay`, or select it as the entrypoint of a separate Deno Deploy app. Configure only a dedicated `HEYBOX_DETAIL_RELAY_TOKEN` of at least 32 characters. This entrypoint does not start KV, database connections, cron jobs or the main website. Pin deployment to a verified commit; do not copy database, login, email or notification credentials into this service.

Set the URL and matching token in the main server's private environment file, optionally set the request budget, then restart it:

```dotenv
HEYBOX_DETAIL_RELAY_URL=https://YOUR_RELAY/v1/details
HEYBOX_DETAIL_RELAY_TOKEN=<DEDICATED_RANDOM_SECRET>
HEYBOX_DETAIL_REQUESTS_PER_MINUTE=3
```

The token must match the detail service. Requests carry only a post ID; arbitrary destination URLs are rejected. HTTPS, Bearer authentication, timeouts, response limits, short-lived caching and in-flight deduplication apply. Failed requests trigger a shared cooldown to avoid repeatedly consuming quotas for every queued post. `GET /healthz` confirms only that the process is running. Verify actual full details, matching and notification delivery before accepting the deployment.

`HEYBOX_DETAIL_REQUESTS_PER_MINUTE` defaults to 3 and accepts integers from 1 to 60. The main service shares a rolling 60-second budget across all accounts; cache hits do not count. Work beyond the budget stays queued without calling AI or reporting a source outage. An incomplete refresh does not overwrite previously saved full details. Neither low request rates nor a separate network location guarantee that Heybox will accept requests; verify real API responses after deployment.

Oracle's `heybox_detail_relay_success` logs include response bytes and elapsed time; `heybox_detail_relay_failed` and `heybox_detail_relay_cooldown` indicate failures. Check actual platform CPU, memory time, requests and egress against the account's limits. Avoiding KV does not by itself guarantee sufficient free-tier capacity. Pending queues and partial-content classification are safeguards during outages, not proof of upstream availability.

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
