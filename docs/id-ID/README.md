# Pemberi Notifikasi Topik Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Bahasa Indonesia** |
|:-----------------------:|:--------------------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Tambahkan topik Heybox di pengaturan, pilih kata kunci, ekspresi reguler, atau filter AI, lalu aktifkan pemeriksaan berkala. Kiriman yang cocok dapat dipindahkan ke riwayat dan dikembalikan ke ruang kerja.

Akun baru memerlukan kode undangan. Notifikasi aplikasi diaktifkan per perangkat dan dapat digunakan bersama email atau webhook. Perubahan luring disinkronkan saat tersambung kembali. Bahasa dan mode gelap mengikuti perangkat secara bawaan.

## Fitur

- Dashboard: melihat status polling, total kecocokan, kecocokan terbaru, dan kecocokan tertunda,
  dengan aksi pemeriksaan manual
- Halaman pengaturan: mengonfigurasi ID topik, status aktif, catatan, unit interval polling, batas
  postingan, mode pengurutan, bahasa UI, mode gelap, dan warna tema
- Pengaturan akun: registrasi, masuk, keluar, memperbarui nama pengguna, dan memperbarui kata sandi;
  data akun diisolasi berdasarkan ID pengguna
- Aturan kata kunci: mendukung aturan bersama, aturan khusus topik, lokasi kecocokan, sensitivitas huruf
  besar/kecil, dan ekspresi reguler
- Pengaturan → Pengaturan notifikasi → Uji notifikasi
- Kanal notifikasi: Webhook kustom, ServerChan, PushPlus, WxPusher, email API, dan SMTP
- Relay notifikasi: relay Cloudflare Worker opsional untuk PushPlus, WxPusher, dan ServerChan

## Pengembangan Lokal

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Layanan Deno berjalan di Oracle Cloud dengan Caddy untuk HTTPS. Akun, sesi, dan hasil disimpan di Turso. GitHub Actions membuat pemasang Windows dan Android dari tag rilis.

[Hosting mandiri](./deployment.md) · [Cloudflare Worker](./worker.md)

## Lisensi

Proyek ini dilisensikan di bawah [GNU Affero General Public License v3.0](../../LICENSE).
