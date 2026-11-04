# Heybox Konu Bildiricisi

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Türkçe** |
| :-------------------------: | :--------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Ayarlardan bir Heybox konusu ekleyin, anahtar kelime, düzenli ifade veya yapay zekâ filtresi seçin ve düzenli denetimi açın. Eşleşen gönderileri geçmişe taşıyabilir ve çalışma alanına geri alabilirsiniz.

Yeni hesap için davet kodu gerekir. Uygulama bildirimleri her cihazda ayrı açılır ve e-posta veya webhook ile birlikte kullanılabilir. Çevrimdışı değişiklikler yeniden bağlanınca eşitlenir. Dil ve koyu mod varsayılan olarak cihaz ayarlarını izler.

## Özellikler

- Pano: yoklama durumunu, toplam eşleşme sayısını, en son eşleşmeyi ve bekleyen eşleşmeleri görüntüleyin;
  ayrıca manuel kontrol işlemi yapın
- Ayarlar sayfası: konu ID’leri, etkin durumu, notlar, yoklama aralığı birimi, gönderi limiti, sıralama modu,
  arayüz dili, karanlık mod ve tema rengini yapılandırın
- Hesap ayarları: kayıt olma, giriş yapma, çıkış yapma, kullanıcı adını güncelleme ve parolayı güncelleme;
  hesap verileri kullanıcı ID’sine göre yalıtılır
- Anahtar kelime kuralları: paylaşılan kurallar, konuya özel kurallar, eşleşme konumları, büyük/küçük harf
  duyarlılığı ve düzenli ifadeler desteklenir
- Ayarlar → Bildirim ayarları → Bildirimi test et
- Bildirim kanalları: özel Webhook, ServerChan, PushPlus, WxPusher, email API ve SMTP
- Bildirim aktarma: PushPlus, WxPusher ve ServerChan için isteğe bağlı Cloudflare Worker aktarması

## Yerel geliştirme

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Deno hizmeti Oracle Cloud üzerinde çalışır ve HTTPS bağlantılarını Caddy yönetir. Hesaplar, oturumlar ve sonuçlar Turso’da saklanır. GitHub Actions sürüm etiketlerinden Windows ve Android kurulum paketlerini oluşturur.

[Kendi sunucunuzda kurulum](./deployment.md) · [Cloudflare Worker](./worker.md)

## Lisans

Bu proje [GNU Affero General Public License v3.0](../../LICENSE) kapsamında lisanslanmıştır.
