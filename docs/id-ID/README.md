# Pemberi Notifikasi Topik Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Bahasa Indonesia** |
|:-----------------------:|:--------------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
adalah aplikasi Deno ringan untuk memantau postingan topik Heybox. Aplikasi ini secara berkala membaca
postingan topik nyata sesuai pengaturan setiap akun, memeriksa judul, isi, komentar, dan balasan terhadap
aturan kata kunci, mencatat kecocokan di tampilan tertunda dan riwayat, lalu mengirim notifikasi melalui
kanal yang dikonfigurasi.

## Fitur

- Dashboard: melihat status polling, total kecocokan, kecocokan terbaru, dan kecocokan tertunda,
  dengan aksi pemeriksaan manual
- Halaman pengaturan: mengonfigurasi ID topik, status aktif, catatan, unit interval polling, batas
  postingan, mode pengurutan, bahasa UI, mode gelap, dan warna tema
- Pengaturan akun: registrasi, masuk, keluar, memperbarui nama pengguna, dan memperbarui kata sandi;
  data akun diisolasi berdasarkan ID pengguna
- Aturan kata kunci: mendukung aturan bersama, aturan khusus topik, lokasi kecocokan, sensitivitas huruf
  besar/kecil, dan ekspresi reguler
- Tabel kecocokan: catatan tertunda dan riwayat sama-sama mendukung filter rentang waktu, paginasi,
  penyelesaian batch, dan aksi hapus
- Entri debug: kecocokan simulasi dan pengujian notifikasi, dengan batas laju sisi server untuk polling
  manual dan operasi debug
- Kanal notifikasi: Webhook kustom, ServerChan, PushPlus, WxPusher, email API, dan SMTP
- Relay notifikasi: relay Cloudflare Worker opsional untuk PushPlus, WxPusher, dan ServerChan
- Keamanan: hash kata sandi PBKDF2, sesi berbasis KV, token CSRF, header keamanan, log audit,
  serta allowlist outbound dengan validasi DNS

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + penjadwal timer lokal
- HTML yang dirender server + JavaScript/CSS vanilla
- Skrip relay notifikasi Cloudflare Workers

## Pengembangan Lokal

Mulai server pengembangan:

```powershell
deno task dev
```

Lalu buka:

```text
http://localhost:8000
```

Untuk mengganti nilai default, gunakan `.env.example` sebagai referensi dan atur variabel lingkungan
yang sesuai di lingkungan runtime Anda. Daftarkan akun pada kunjungan pertama; variabel lingkungan hanya
mengisi nilai default untuk akun baru atau data default, lalu halaman pengaturan setiap akun menjadi
sumber kebenaran setelahnya.

Aplikasi ini menyediakan halaman registrasi dan login. Setiap akun memiliki pengaturan, riwayat kecocokan,
status polling, dan konfigurasi notifikasi yang terisolasi, sehingga pengguna yang berbagi URL deployment
yang sama tidak berbagi data. Kata sandi pengguna disimpan di Deno KV sebagai hash PBKDF2 dengan salt,
bukan plaintext. Sesi login disimpan di Deno KV, dan cookie browser hanya berisi token sesi acak.
Perubahan pengaturan, akun, dan debug memvalidasi token CSRF, dan operasi sensitif dibatasi lajunya pada
deployment publik.

## Perintah

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` menghapus penanda postingan yang sudah diproses agar postingan yang sama dapat diverifikasi
lagi; gunakan dengan hati-hati di produksi.

## Deployment

Lihat [deployment](./deployment.md) untuk pengaturan Deno Deploy. Entrypoint aplikasi ditentukan oleh
bagian `deploy` di `deno.json`; GitHub Actions hanya menjalankan pemeriksaan dan tidak men-deploy
aplikasi. Entrypoint deployment di `src/deploy.ts` mendeklarasikan Deno Deploy Cron, dan polling aktual
hanya berjalan pada Production dan timeline Git Branch `dev`. Lihat [worker](./worker.md) untuk pengaturan
Worker relay notifikasi.

## Lisensi

Proyek ini dilisensikan di bawah [GNU Affero General Public License v3.0](../../LICENSE).