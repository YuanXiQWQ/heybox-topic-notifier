# Deployment Talimatları

Deno hizmeti Oracle Cloud üzerinde çalışır ve HTTPS bağlantılarını Caddy yönetir. Hesaplar, oturumlar ve sonuçlar Turso’da saklanır. GitHub Actions sürüm etiketlerinden Windows ve Android kurulum paketlerini oluşturur.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Runtime Environment Variables

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Test için ayrı bir veritabanı kullanın. Önce eski sunucudaki düzenli denetimi durdurun. Ardından üretim ortamında `VM_POLLING_ENABLED=true` ayarını yapıp hizmeti yeniden başlatın.

- Temel varsayılanlar: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Polling tuning: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox request overrides: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Ortak notification öğesi: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook notification: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email notification: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Notification relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Outbound security allowlist: `OUTBOUND_ALLOWED_HOSTS`

Notification delivery, custom Webhook, Email API ve SMTP hedeflerini doğrular. Varsayılan olarak yalnızca public HTTPS URL’leri ve yaygın SMTP
port’ları izinlidir; self-hosted relay veya sabit mail service kullanmanız gerekiyorsa, virgülle ayrılmış `OUTBOUND_ALLOWED_HOSTS`
ile ilgili host’ları açıkça izinli hale getirebilirsiniz, örneğin `relay.example.com,smtp.example.com`.
Bu değişken ayarlandıktan sonra notification outbound target, listedeki bir host’a veya `*.example.com` biçimindeki wildcard’a eşleşmelidir.

HTTP redirect’leri hop bazında doğrulanır ve yalnızca same-origin redirect’lere izin verilir. `OUTBOUND_ALLOWED_HOSTS` yapılandırılmadığında, target host’un DNS
A/AAAA çözümleme sonucu da localhost, internal network, link-local, metadata service veya reserved address range içine düşmemesi için doğrulanır. `OUTBOUND_ALLOWED_HOSTS`
administrator tarafından açıkça tanımlanan bir trust boundary’dir; wildcard yalnızca tamamen kontrol edilen domain’ler altında yapılandırılmalıdır.

Gerçek Heybox topic fetching şu anda tek runtime data source’tur. Varsayılan olarak `HEYBOX_SIGNATURE_MODE=app`, doğrulanmış App API
publish-time list’i kullanır; `web` yalnızca diagnostic fallback olarak tutulur.
Yeni account’lar polling kapalı olarak başlar ve yalnızca kendi settings page’inde “Enable polling” açıldıktan sonra fetch yapar.

## Notification Relay

Oracle Cloud, PushPlus, WxPusher veya Server酱’e doğrudan erişemiyorsa önce ücretsiz bir Cloudflare Worker
relay deploy edebilirsiniz. Repository’deki `workers/notification-relay.js`, sabit olarak `/pushplus`, `/wxpusher` ve `/serverchan`
adlı üç forwarding entry sağlar ve authentication için `Authorization: Bearer <token>` kullanır; tüm adımlar için [worker.md](worker.md) dosyasına bakın.

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Doğrulama

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
