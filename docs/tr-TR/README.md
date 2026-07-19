# Heybox Konu Bildiricisi

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Türkçe** |
|:-----------------------:|:----------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
Heybox konu gönderilerini izlemek için hafif bir Deno uygulamasıdır. Her hesabın ayarlarına göre gerçek
konu gönderilerini düzenli aralıklarla okur, başlıkları, gövdeleri, yorumları ve yanıtları anahtar kelime
kurallarıyla karşılaştırır, eşleşmeleri bekleyenler ve geçmiş görünümlerine kaydeder ve bildirimleri
yapılandırılmış kanal üzerinden gönderir.

## Özellikler

- Pano: yoklama durumunu, toplam eşleşme sayısını, en son eşleşmeyi ve bekleyen eşleşmeleri görüntüleyin;
  ayrıca manuel kontrol işlemi yapın
- Ayarlar sayfası: konu ID’leri, etkin durumu, notlar, yoklama aralığı birimi, gönderi limiti, sıralama modu,
  arayüz dili, karanlık mod ve tema rengini yapılandırın
- Hesap ayarları: kayıt olma, giriş yapma, çıkış yapma, kullanıcı adını güncelleme ve parolayı güncelleme;
  hesap verileri kullanıcı ID’sine göre yalıtılır
- Anahtar kelime kuralları: paylaşılan kurallar, konuya özel kurallar, eşleşme konumları, büyük/küçük harf
  duyarlılığı ve düzenli ifadeler desteklenir
- Eşleşme tabloları: bekleyen ve geçmiş kayıtları zaman aralığı filtreleri, sayfalama, toplu tamamlama ve
  silme işlemlerini destekler
- Hata ayıklama girdileri: simüle edilmiş eşleşmeler ve bildirim testleri; manuel yoklama ve hata ayıklama
  işlemleri için sunucu tarafı hız sınırlarıyla birlikte
- Bildirim kanalları: özel Webhook, ServerChan, PushPlus, WxPusher, email API ve SMTP
- Bildirim aktarma: PushPlus, WxPusher ve ServerChan için isteğe bağlı Cloudflare Worker aktarması
- Güvenlik: PBKDF2 parola hash’leri, KV destekli oturumlar, CSRF token’ları, güvenlik başlıkları,
  denetim günlükleri ve DNS doğrulamalı giden allowlist

## Teknoloji yığını

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + yerel zamanlayıcı planlayıcı
- Sunucu tarafında işlenmiş HTML + vanilla JavaScript/CSS
- Bildirim aktarması için Cloudflare Workers betiği

## Yerel geliştirme

Geliştirme sunucusunu başlatın:

```powershell
deno task dev
```

Ardından açın:

```text
http://localhost:8000
```

Varsayılanları geçersiz kılmak için `.env.example` dosyasını referans olarak kullanın ve çalışma zamanı
ortamınızda ilgili ortam değişkenlerini ayarlayın. İlk ziyarette bir hesap kaydedin; ortam değişkenleri
yalnızca yeni hesaplar veya varsayılan veriler için başlangıç varsayılanlarını oluşturur, sonrasında her
hesabın ayarlar sayfası doğruluk kaynağı olur.

Uygulama kayıt ve giriş sayfaları sağlar. Her hesabın ayarları, eşleşme geçmişi, yoklama durumu ve bildirim
yapılandırması yalıtılmıştır; bu nedenle aynı deployment URL’sini paylaşan kullanıcılar veri paylaşmaz.
Kullanıcı parolaları Deno KV’de düz metin olarak değil, salt eklenmiş PBKDF2 hash’leri olarak saklanır.
Giriş oturumları Deno KV’de saklanır ve tarayıcı cookie’si yalnızca rastgele bir oturum token’ı içerir.
Ayar, hesap ve hata ayıklama değişiklikleri CSRF token’ını doğrular; hassas işlemler public deployment’larda
hız sınırına tabidir.

## Komutlar

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen`, işlenmiş gönderi işaretlerini temizler; böylece aynı gönderiler tekrar doğrulanabilir.
Production ortamında dikkatli kullanın.

## Deployment

Deno Deploy kurulumu için [deployment](./deployment.md) bölümüne bakın. Uygulama giriş noktası `deno.json`
içindeki `deploy` bölümüyle tanımlanır; GitHub Actions yalnızca kontrolleri çalıştırır ve uygulamayı
deploy etmez. `src/deploy.ts` içindeki deployment giriş noktası Deno Deploy Cron’u bildirir ve gerçek
yoklama yalnızca Production ile `dev` Git Branch zaman çizelgesinde çalışır. Bildirim aktarma Worker kurulumu
için [worker](./worker.md) bölümüne bakın.

## Lisans

Bu proje [GNU Affero General Public License v3.0](../../LICENSE) kapsamında lisanslanmıştır.