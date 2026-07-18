# Worker relay уведомлений

`notification-relay.js` — это лёгкий relay для Cloudflare Workers, который предоставляет только:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> официальный API Server酱
- `GET /healthz` health check

Он не принимает произвольные целевые URL, поэтому не может использоваться как open proxy. Вход Server酱 принимает только безопасный
SendKey и формирует официальный адрес по существующим правилам проекта.

## Шаги развёртывания

1. Создайте бесплатный Worker в Cloudflare Workers.
2. Вставьте содержимое `workers/notification-relay.js` в редактор Worker или разверните этот скрипт через Wrangler.
3. Добавьте `RELAY_TOKEN` в переменные/секреты Worker, используя в качестве значения длинный случайный секрет.
4. После развёртывания откройте `https://<your-worker>.workers.dev/healthz` и убедитесь, что возвращается `{"status":"ok"}`.
5. Настройте Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Сторона проекта отправляет следующее только тогда, когда адрес отправки PushPlus, WxPusher или Server酱 заменён на адрес relay:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Relay Server酱 также передаёт SendKey через отдельный request header:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Тест в консоли

Сначала можно проверить работу аутентификации в консоли Worker или локально через curl:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Тест WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Тест Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```