# Worker di relay notifiche

`notification-relay.js` è un relay leggero per Cloudflare Workers e fornisce solo:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API ufficiale di Server酱
- `GET /healthz` health check

Non accetta URL di destinazione arbitrari, quindi non può essere usato come proxy aperto. L’endpoint Server酱 accetta solo un
SendKey sicuro e costruisce l’indirizzo ufficiale secondo le regole esistenti del progetto.

## Passaggi di deployment

1. Crea un Worker gratuito in Cloudflare Workers.
2. Incolla il contenuto di `workers/notification-relay.js` nell’editor del Worker, oppure distribuisci lo script con Wrangler.
3. Aggiungi `RELAY_TOKEN` nelle variabili/segreti del Worker, usando come valore una lunga chiave casuale.
4. Dopo il deployment, visita `https://<your-worker>.workers.dev/healthz` e verifica che restituisca `{"status":"ok"}`.
5. Configura Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Il lato progetto invierà quanto segue solo quando l’indirizzo di invio di PushPlus, WxPusher o Server酱 è stato modificato nell’indirizzo del relay:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Il relay Server酱 passerà inoltre il SendKey tramite un header di richiesta dedicato:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Test da console

Puoi prima verificare dalla console Worker o con curl locale se l’autenticazione è attiva:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Test WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Test Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```