# Deployment Talimatları

Bu proje, Deno Deploy’un GitHub entegrasyonu ile deploy edilir ve uygulamayı deploy etmek için GitHub Actions kullanılmaz. GitHub Actions yalnızca
`deno task check` çalıştırır; repository’ye push yapıldıktan sonra uygulamayı build etmek ve route etmek Deno Deploy’un sorumluluğundadır.

## Branch Deployment

Deno Deploy, aynı App için farklı timeline’lar oluşturur:

- `main`: resmi release deployment, Production URL’ye route edilir
- `dev`: release öncesi test deployment, Git Branch / DEV URL’ye route edilir

Mevcut App adı `heybox-topic-notifier` olduğunda URL kuralı yaklaşık olarak şöyledir:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Mevcut `dev` test deployment’ı zaten oluşturulmuştur ve stabil test giriş noktası Git Branch / DEV URL’dir. Bundan sonra `dev` branch’ine yapılan push’lar
test deployment güncellemesini tetikler, `main` branch’ine yapılan push’lar ise Production güncellemesini tetikler.

Deno Deploy’un GitHub entegrasyonu, feature branch push’ları için Git Branch timeline ve Build oluşturabilir. Preview
ve normal feature branch’lerin KV’yi tekrar tekrar okumasını, Heybox fetch etmesini veya notification göndermesini önlemek için deployment entrypoint top level’da Cron bildirir, ancak handler yalnızca
`DENO_TIMELINE=production` veya `DENO_TIMELINE=git-branch/dev` olduğunda çalışmaya devam eder. Normal page request’leri, root path,
health check ve Warm up
request’leri automatic polling tetiklemez; frontend sayfasında bir dakikadan kısa süre içinde vadesi gelen sorgular, kontrollü state API üzerinden mevcut account scheduling’i tetikler.

## Deno Deploy Yapılandırması

Deno Deploy App içinde aşağıdaki yapılandırmayı koruyun:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` içindeki deploy yapılandırması, deployment entrypoint için repository tarafındaki tek yapılandırma kaynağıdır.

## Veritabanı

Deno Deploy App, Deno KV veritabanına bağlanmıştır. Kod, account, settings, history, polling state ve processed-post marker’larını okumak/yazmak için `Deno.openKv()`
kullanır. Account password’leri salt eklenmiş PBKDF2 hash’leri olarak saklanır; user data user
ID prefix’e göre izole edilir ve Deno Deploy, Production ile Git Branch verilerini timeline’a göre ayrıca izole eder.

## Runtime Environment Variables

Deno Deploy App içinde ihtiyaca göre yapılandırın. Repository root içindeki `.env.example` senaryolara göre düzenlenmiştir: varsayılan olarak yalnızca minimum kullanılabilir configuration etkinleştirilir,
diğer polling tuning, notification channel, relay ve security allowlist ayarları yorumda bırakılır; hangi senaryo kullanılacaksa yalnızca ilgili satırların yorumu kaldırılır.

- Temel varsayılanlar: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

Uygulama registration ve login sayfaları sağlar. Account information, login sessions ve her account’un settings, match records, polling state, notification configuration verileri
Deno KV içinde saklanır ve user ID’ye göre izole edilir. Browser Cookie yalnızca random session token saklar; server token
hash ve expiry time saklar.

Gerçek Heybox topic fetching şu anda tek runtime data source’tur. Varsayılan olarak `HEYBOX_SIGNATURE_MODE=app`, doğrulanmış App API
publish-time list’i kullanır; `web` yalnızca diagnostic fallback olarak tutulur. `POLL_ENABLED`
yalnızca yeni account veya default account için initial polling switch olarak kullanılır; gerçekten fetch yapılıp yapılmayacağı her account’un settings page içindeki “Enable polling” seçeneğine bağlıdır.

## Notification Relay

Deno Deploy, PushPlus, WxPusher veya Server酱’e doğrudan erişemiyorsa önce ücretsiz bir Cloudflare Worker
relay deploy edebilirsiniz. Repository’deki `workers/notification-relay.js`, sabit olarak `/pushplus`, `/wxpusher` ve `/serverchan`
adlı üç forwarding entry sağlar ve authentication için `Authorization: Bearer <token>` kullanır; tüm adımlar için [worker.md](worker.md) dosyasına bakın.

Deno Deploy tarafı configuration örneği:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Doğrulama

Deployment tamamlandıktan sonra şu adrese gidin:

```text
/healthz
```

`status: ok` dönmesi, service process’in başladığı ve health check’in Deno KV okumadığı anlamına gelir.