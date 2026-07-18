# Worker Relay Notifikasi

`notification-relay.js` adalah relay ringan untuk Cloudflare Workers, dan hanya menyediakan:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API resmi Server酱
- `GET /healthz` health check

Worker ini tidak menerima URL target sembarang, sehingga tidak dapat digunakan sebagai proxy terbuka. Entry Server酱 hanya menerima
SendKey yang aman, dan membentuk alamat resmi sesuai aturan proyek yang sudah ada.

## Langkah Deployment

1. Buat Worker gratis di Cloudflare Workers.
2. Tempel isi `workers/notification-relay.js` ke editor Worker, atau deploy script ini dengan Wrangler.
3. Tambahkan `RELAY_TOKEN` pada variabel/secret Worker, dengan nilai berupa secret acak yang panjang.
4. Setelah deployment, akses `https://<your-worker>.workers.dev/healthz` dan pastikan mengembalikan `{"status":"ok"}`.
5. Konfigurasikan Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Sisi proyek hanya akan mengirimkan berikut ini ketika alamat pengiriman PushPlus, WxPusher, atau Server酱 diubah menjadi alamat relay:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Relay Server酱 juga akan meneruskan SendKey melalui header request khusus:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Pengujian Konsol

Anda dapat terlebih dahulu menguji apakah autentikasi berlaku di konsol Worker atau dengan curl lokal:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Pengujian WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Pengujian Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```