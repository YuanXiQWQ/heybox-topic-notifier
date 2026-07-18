# Инструкция по развёртыванию

Этот проект развёртывается через GitHub-интеграцию Deno Deploy и не использует GitHub Actions для развёртывания приложения. GitHub Actions только запускает
`deno task check`, а Deno Deploy после push в репозиторий выполняет сборку и маршрутизацию приложения.

## Развёртывание веток

Deno Deploy создаёт разные timelines для одной и той же App:

- `main`: официальное release-развёртывание, маршрутизируется на Production URL
- `dev`: тестовое развёртывание перед релизом, маршрутизируется на Git Branch / DEV URL

Когда текущая App называется `heybox-topic-notifier`, URL-соглашение примерно такое:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Текущее тестовое развёртывание `dev` уже создано, и стабильная точка входа для тестирования — Git Branch / DEV URL. Последующие push в `dev`
будут обновлять тестовое развёртывание, а push в `main` будут обновлять Production.

GitHub-интеграция Deno Deploy может создавать Git Branch timelines и Builds для push в feature-ветки. Чтобы Preview
и обычные feature-ветки не читали KV, не получали данные Heybox и не отправляли уведомления повторно, entrypoint развёртывания объявляет Cron на верхнем уровне, но handler продолжает выполнение только при
`DENO_TIMELINE=production` или `DENO_TIMELINE=git-branch/dev`. Обычные запросы страниц, корневой путь,
health check и запросы Warm up
не запускают автоматический polling; проверки наступившего времени на frontend-странице с интервалом менее одной минуты запускают планирование текущего аккаунта через контролируемый state API.

## Конфигурация Deno Deploy

Сохраняйте следующую конфигурацию в Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

Конфигурация deploy в `deno.json` является единственным источником конфигурации репозитория для entrypoint развёртывания.

## База данных

Deno Deploy App уже привязана к базе данных Deno KV. Код использует `Deno.openKv()`
для чтения и записи аккаунтов, настроек, истории, состояния polling и маркеров обработанных публикаций. Пароли аккаунтов сохраняются как salted PBKDF2 hashes; пользовательские данные изолируются по префиксу user
ID, а Deno Deploy также изолирует данные Production и Git Branch по timeline.

## Переменные окружения выполнения

Настраиваются в Deno Deploy App по необходимости. Файл `.env.example` в корне репозитория организован по сценариям: по умолчанию включена только минимально работоспособная конфигурация,
а остальные настройки тюнинга polling, каналов уведомлений, relay и security allowlist остаются закомментированными; раскомментируйте только строки, соответствующие нужному сценарию.

- Базовые значения по умолчанию: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

Приложение предоставляет страницы регистрации и входа. Информация аккаунта, login sessions, а также настройки, записи совпадений, состояние polling и конфигурация уведомлений каждого аккаунта сохраняются в
Deno KV и изолируются по user ID. Browser Cookie хранит только random session token; сервер хранит token
hash и время истечения.

Реальное получение тем Heybox сейчас является единственным runtime-источником данных. По умолчанию `HEYBOX_SIGNATURE_MODE=app` использует проверенный список времени публикаций App API;
`web` сохранён только как диагностический fallback. `POLL_ENABLED`
служит только начальным переключателем polling для новых аккаунтов или default account; фактическое получение данных зависит от “Enable polling” на странице настроек каждого аккаунта.

## Relay уведомлений

Если Deno Deploy не может напрямую обратиться к PushPlus, WxPusher или Server酱, можно сначала развернуть бесплатный Cloudflare Worker
relay. Файл `workers/notification-relay.js` в репозитории фиксированно предоставляет три входа пересылки: `/pushplus`, `/wxpusher` и `/serverchan`,
и использует `Authorization: Bearer <token>` для аутентификации; полные шаги см. в [worker.md](worker.md).

Пример конфигурации на стороне Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Проверка

После завершения развёртывания откройте:

```text
/healthz
```

Если возвращается `status: ok`, это означает, что процесс сервиса запущен, а health check не читает Deno KV.