# Инструкция по развёртыванию

Служба Deno работает в Oracle Cloud, а Caddy обслуживает HTTPS. Учётные записи, сеансы и результаты хранятся в Turso. GitHub Actions собирает установочные пакеты Windows и Android по тегам выпусков.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Переменные окружения выполнения

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Для проверки используйте отдельную базу данных. Остановите опрос на прежнем сервере, затем задайте `VM_POLLING_ENABLED=true` в рабочей конфигурации и перезапустите службу.

- Базовые значения по умолчанию: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Настройка polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Переопределение запросов Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Общие параметры уведомлений: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook-уведомления: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Email-уведомления: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Relay уведомлений: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist исходящей безопасности: `OUTBOUND_ALLOWED_HOSTS`

Доставка уведомлений проверяет цели custom Webhook, Email API и SMTP. По умолчанию разрешены только публичные HTTPS URL и распространённые SMTP
порты; если нужно использовать self-hosted relay или фиксированный почтовый сервис, можно через разделённый запятыми `OUTBOUND_ALLOWED_HOSTS`
явно разрешить соответствующие хосты, например `relay.example.com,smtp.example.com`.
После установки этой переменной исходящая цель уведомления должна совпадать с хостом из списка или wildcard вида `*.example.com`.

HTTP redirects проверяются на каждом hop, и разрешены только same-origin redirects. Если `OUTBOUND_ALLOWED_HOSTS` не настроен, также проверяется, что результаты DNS
A/AAAA для целевого хоста не попадают в localhost, внутреннюю сеть, link-local, metadata service или зарезервированные диапазоны адресов. `OUTBOUND_ALLOWED_HOSTS`
— это явно заданная администратором граница доверия; wildcards следует настраивать только под полностью контролируемыми доменами.

Реальное получение тем Heybox сейчас является единственным runtime-источником данных. По умолчанию `HEYBOX_SIGNATURE_MODE=app` использует проверенный список времени публикаций App API;
`web` сохранён только как диагностический fallback.
Новые аккаунты начинают с выключенным polling и получают данные только после включения “Enable polling” на своей странице настроек.

## Relay уведомлений

Если Oracle Cloud не может напрямую обратиться к PushPlus, WxPusher или Server酱, можно сначала развернуть бесплатный Cloudflare Worker
relay. Файл `workers/notification-relay.js` в репозитории фиксированно предоставляет три входа пересылки: `/pushplus`, `/wxpusher` и `/serverchan`,
и использует `Authorization: Bearer <token>` для аутентификации; полные шаги см. в [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Проверка

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
