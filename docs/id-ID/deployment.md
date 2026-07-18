# Panduan Deployment

Proyek ini menggunakan integrasi GitHub dari Deno Deploy untuk deployment, dan tidak menggunakan GitHub Actions untuk men-deploy aplikasi. GitHub Actions hanya menjalankan
`deno task check`, sedangkan Deno Deploy menangani build dan routing aplikasi setelah repository menerima push.

## Deployment Branch

Deno Deploy akan membuat timeline berbeda untuk App yang sama:

- `main`: deployment rilis resmi, diarahkan ke Production URL
- `dev`: deployment pengujian pra-rilis, diarahkan ke Git Branch / DEV URL

Saat App saat ini bernama `heybox-topic-notifier`, konvensi URL kira-kira sebagai berikut:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Deployment pengujian `dev` saat ini sudah dibuat, dan pintu masuk pengujian stabil adalah Git Branch / DEV URL. Push berikutnya ke `dev`
akan memicu pembaruan deployment pengujian, sedangkan push ke `main` akan memicu pembaruan Production.

Integrasi GitHub dari Deno Deploy dapat membuat Git Branch timeline dan Build untuk push branch fitur. Untuk menghindari Preview
dan branch fitur biasa membaca KV, mengambil data Heybox, atau mengirim notifikasi berulang kali, entrypoint deployment mendeklarasikan Cron di level atas, tetapi handler hanya akan melanjutkan eksekusi saat
`DENO_TIMELINE=production` atau `DENO_TIMELINE=git-branch/dev`. Request halaman biasa, root path,
health check, dan request Warm up
tidak akan memicu polling otomatis; query jatuh tempo dari halaman frontend yang kurang dari satu menit akan memicu penjadwalan akun saat ini melalui antarmuka status yang terkendali.

## Konfigurasi Deno Deploy

Pertahankan konfigurasi berikut di Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

Konfigurasi deploy di `deno.json` adalah satu-satunya sumber konfigurasi repository untuk entrypoint deployment.

## Database

Deno Deploy App sudah terikat ke database Deno KV. Kode menggunakan `Deno.openKv()`
untuk membaca dan menulis akun, pengaturan, riwayat, status polling, dan penanda postingan yang sudah diproses. Kata sandi akun disimpan sebagai hash PBKDF2 dengan salt; data pengguna diisolasi berdasarkan prefiks user
ID, dan Deno Deploy juga mengisolasi data Production dan Git Branch berdasarkan timeline.

## Variabel Lingkungan Runtime

Konfigurasikan di Deno Deploy App sesuai kebutuhan. `.env.example` di root repository sudah disusun berdasarkan skenario: secara default hanya konfigurasi minimum yang dapat digunakan yang diaktifkan,
sedangkan konfigurasi lain untuk penyetelan polling, kanal notifikasi, relay, dan allowlist keamanan tetap diberi komentar; hapus komentar hanya pada baris yang sesuai dengan skenario yang digunakan.

- Nilai default dasar: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

Aplikasi menyediakan halaman registrasi dan login. Informasi akun, sesi login, serta pengaturan, catatan kecocokan, status polling, dan konfigurasi notifikasi tiap akun disimpan di
Deno KV dan diisolasi berdasarkan user ID. Cookie browser hanya menyimpan random session token; server menyimpan hash token
dan waktu kedaluwarsa.

Pengambilan topik Heybox nyata saat ini adalah satu-satunya sumber data runtime. Secara default `HEYBOX_SIGNATURE_MODE=app` menggunakan daftar waktu publikasi App API yang sudah diverifikasi;
`web` hanya dipertahankan sebagai fallback diagnostik. `POLL_ENABLED`
hanya berfungsi sebagai sakelar polling awal untuk akun baru atau akun default; apakah pengambilan benar-benar dilakukan bergantung pada “Enable polling” di halaman pengaturan tiap akun.

## Relay Notifikasi

Jika Deno Deploy tidak dapat langsung mengakses PushPlus, WxPusher, atau Server酱, Anda dapat men-deploy relay Cloudflare Worker gratis terlebih dahulu.
`workers/notification-relay.js` di repository menyediakan tiga entry penerusan tetap: `/pushplus`, `/wxpusher`, dan `/serverchan`,
serta menggunakan `Authorization: Bearer <token>` untuk autentikasi; langkah lengkapnya lihat [worker.md](worker.md).

Contoh konfigurasi di sisi Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verifikasi

Setelah deployment selesai, akses:

```text
/healthz
```

Jika mengembalikan `status: ok`, berarti proses layanan sudah berjalan, dan health check tidak membaca Deno KV.