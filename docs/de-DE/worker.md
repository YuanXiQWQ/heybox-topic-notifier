# Benachrichtigungs-Relay-Worker

`notification-relay.js` ist ein leichtgewichtiges Relay für Cloudflare Workers und stellt nur Folgendes bereit:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> offizielle Server酱-Schnittstelle
- `GET /healthz` Health Check

Es akzeptiert keine beliebigen Ziel-URLs und kann daher nicht als offener Proxy verwendet werden. Der Server酱-Endpunkt akzeptiert nur sichere
SendKeys und konstruiert die offizielle Adresse nach den bestehenden Projektregeln.

## Bereitstellungsschritte

1. Erstellen Sie in Cloudflare Workers einen kostenlosen Worker.
2. Fügen Sie den Inhalt von `workers/notification-relay.js` in den Worker-Editor ein oder deployen Sie das Skript mit Wrangler.
3. Fügen Sie in den Variablen/Secrets des Workers `RELAY_TOKEN` hinzu und verwenden Sie als Wert ein langes zufälliges Geheimnis.
4. Rufen Sie nach dem Deployment `https://<your-worker>.workers.dev/healthz` auf und prüfen Sie, ob `{"status":"ok"}` zurückgegeben wird.
5. Konfigurieren Sie Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Die Projektseite sendet nur dann Folgendes, wenn die Sendeadresse von PushPlus, WxPusher oder Server酱 auf die Relay-Adresse geändert wurde:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Das Server酱-Relay übergibt den SendKey außerdem über einen dedizierten Request-Header:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Konsolentest

Sie können zunächst in der Worker-Konsole oder lokal mit curl testen, ob die Authentifizierung greift:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher-Test:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Server酱-Test:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```