# Heybox Topic Notifier

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **हिन्दी** |
|:-----------------------:|:----------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

सेटिंग में Heybox विषय जोड़ें, कीवर्ड, रेगुलर एक्सप्रेशन या AI फ़िल्टर चुनें और नियमित जाँच चालू करें। मिले हुए पोस्ट इतिहास में भेजे जा सकते हैं और कार्यक्षेत्र में वापस लाए जा सकते हैं।

नया खाता बनाने के लिए आमंत्रण कोड चाहिए। ऐप सूचनाएँ हर डिवाइस पर अलग से चालू होती हैं और ईमेल या Webhook के साथ इस्तेमाल की जा सकती हैं। ऑफ़लाइन बदलाव दोबारा कनेक्ट होने पर सिंक होते हैं। भाषा और डार्क मोड शुरू में डिवाइस की सेटिंग के अनुसार होते हैं।

## विशेषताएँ

- Dashboard: poll status, कुल matches, latest match और pending matches देखें, manual check action के साथ
- Settings page: topic IDs, enabled state, notes, polling interval unit, post limit, sort mode,
  UI language, dark mode और theme color configure करें
- Account settings: register, log in, log out, username update और password update; account data user ID
  के अनुसार अलग रखा जाता है
- Keyword rules: shared rules, topic-specific rules, match locations, case sensitivity और regular
  expressions का समर्थन
- सेटिंग → सूचना सेटिंग → सूचना परीक्षण
- Notification channels: custom Webhook, ServerChan, PushPlus, WxPusher, email API और SMTP
- Notification relay: PushPlus, WxPusher और ServerChan के लिए optional Cloudflare Worker relay

## Local Development

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Deno सेवा Oracle Cloud पर चलती है और Caddy HTTPS संभालता है। खाते, सत्र और परिणाम Turso में सहेजे जाते हैं। रिलीज़ टैग से GitHub Actions Windows और Android के इंस्टॉलर बनाता है।

[अपने सर्वर पर स्थापना](./deployment.md) · [Cloudflare Worker](./worker.md)

## License

यह project [GNU Affero General Public License v3.0](../../LICENSE) के अंतर्गत licensed है।
