# Panduan Deployment

Layanan Deno berjalan di Oracle Cloud dengan Caddy untuk HTTPS. Akun, sesi, dan hasil disimpan di Turso. GitHub Actions membuat pemasang Windows dan Android dari tag rilis.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Variabel Lingkungan Runtime

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Gunakan basis data terpisah untuk pengujian. Setelah pemeriksaan berkala di server lama berhenti, tetapkan `VM_POLLING_ENABLED=true` di server produksi dan mulai ulang layanan.

- Nilai default dasar: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Penyetelan polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Override request Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Item umum notifikasi: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notifikasi Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notifikasi email: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Relay notifikasi: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist keamanan outbound: `OUTBOUND_ALLOWED_HOSTS`

Pengiriman notifikasi akan memvalidasi target Webhook kustom, Email API, dan SMTP. Secara default hanya URL HTTPS publik dan port SMTP
umum yang diizinkan; jika perlu menggunakan relay self-hosted atau layanan email tetap, gunakan `OUTBOUND_ALLOWED_HOSTS` yang dipisahkan koma
untuk mengizinkan host terkait secara eksplisit, misalnya `relay.example.com,smtp.example.com`.
Setelah variabel ini diatur, target outbound notifikasi harus cocok dengan host dalam daftar atau wildcard berbentuk `*.example.com`.

Redirect HTTP divalidasi per hop, dan hanya redirect same-origin yang diizinkan. Jika `OUTBOUND_ALLOWED_HOSTS` tidak dikonfigurasi, hasil DNS
A/AAAA dari host target juga divalidasi agar tidak berada dalam rentang localhost, jaringan internal, link-local, layanan metadata, atau alamat cadangan. `OUTBOUND_ALLOWED_HOSTS`
adalah batas kepercayaan eksplisit yang ditentukan administrator; wildcard hanya boleh dikonfigurasi di bawah domain yang sepenuhnya Anda kendalikan.

Pengambilan topik Heybox nyata saat ini adalah satu-satunya sumber data runtime. Secara default `HEYBOX_SIGNATURE_MODE=app` menggunakan daftar waktu publikasi App API yang sudah diverifikasi;
`web` hanya dipertahankan sebagai fallback diagnostik.
Akun baru dimulai dengan polling nonaktif dan baru mengambil data setelah mengaktifkan “Enable polling” di halaman pengaturannya.

## Relay Notifikasi

Jika Oracle Cloud tidak dapat langsung mengakses PushPlus, WxPusher, atau Server酱, Anda dapat men-deploy relay Cloudflare Worker gratis terlebih dahulu.
`workers/notification-relay.js` di repository menyediakan tiga entry penerusan tetap: `/pushplus`, `/wxpusher`, dan `/serverchan`,
serta menggunakan `Authorization: Bearer <token>` untuk autentikasi; langkah lengkapnya lihat [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verifikasi

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
