# Notification Relay Worker

`notification-relay.js`, Cloudflare Workers için hafif bir relay’dir ve yalnızca şunları sağlar:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> resmi Server酱 API
- `GET /healthz` health check

Keyfi target URL kabul etmez; bu yüzden open proxy olarak kullanılamaz. Server酱 entry yalnızca güvenli
SendKey kabul eder ve resmi adresi projenin mevcut kurallarına göre oluşturur.

## Deployment Adımları

1. Cloudflare Workers içinde ücretsiz bir Worker oluşturun.
2. `workers/notification-relay.js` içeriğini Worker editor’e yapıştırın veya script’i Wrangler ile deploy edin.
3. Worker variables/secrets içine `RELAY_TOKEN` ekleyin ve değer olarak uzun rastgele bir secret kullanın.
4. Deployment sonrası `https://<your-worker>.workers.dev/healthz` adresine gidin ve `{"status":"ok"}` döndüğünü doğrulayın.
5. Deno Deploy’u yapılandırın:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Proje tarafı yalnızca PushPlus, WxPusher veya Server酱 send address’i relay address’e değiştirildiğinde şunu gönderir:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Server酱 relay ayrıca SendKey değerini özel bir request header ile iletir:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Console Testi

Önce Worker console’da veya local curl ile authentication’ın çalışıp çalışmadığını test edebilirsiniz:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher testi:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server酱 testi:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```