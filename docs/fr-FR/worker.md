# Worker de relais de notification

`notification-relay.js` est un relais léger destiné à Cloudflare Workers. Il fournit uniquement :

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API officielle de Server酱
- `GET /healthz` contrôle de santé

Il n’accepte pas d’URL cible arbitraire et ne peut donc pas être utilisé comme proxy ouvert. Le point d’entrée Server酱 n’accepte qu’un
SendKey sécurisé et construit l’adresse officielle selon les règles existantes du projet.

## Étapes de déploiement

1. Créez un Worker gratuit dans Cloudflare Workers.
2. Collez le contenu de `workers/notification-relay.js` dans l’éditeur du Worker, ou déployez ce script avec Wrangler.
3. Ajoutez `RELAY_TOKEN` dans les variables/secrets du Worker, avec une longue clé aléatoire comme valeur.
4. Après le déploiement, accédez à `https://<your-worker>.workers.dev/healthz` et vérifiez que `{"status":"ok"}` est renvoyé.
5. Configurez Deno Deploy :

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

Côté projet, l’en-tête suivant n’est envoyé que lorsque l’adresse d’envoi PushPlus, WxPusher ou Server酱 a été remplacée par l’adresse du relais :

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

Le relais Server酱 transmet également le SendKey via un en-tête de requête dédié :

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Test dans la console

Vous pouvez d’abord tester si l’authentification fonctionne dans la console du Worker ou avec curl en local :

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Test WxPusher :

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Test Server酱 :

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```