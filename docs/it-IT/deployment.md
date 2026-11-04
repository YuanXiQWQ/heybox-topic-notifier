# Istruzioni di deployment

Il servizio Deno è ospitato su Oracle Cloud e usa Caddy per HTTPS. Turso conserva account, sessioni e risultati. GitHub Actions crea i pacchetti di installazione per Windows e Android dai tag di rilascio.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Variabili d’ambiente runtime

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Usa un database separato per i test. Dopo aver fermato le verifiche periodiche sul vecchio server, imposta `VM_POLLING_ENABLED=true` in produzione e riavvia il servizio.

- Valori predefiniti di base: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Ottimizzazione polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Override richieste Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Opzioni comuni di notifica: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notifiche Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notifiche e-mail: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Relay notifiche: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist di sicurezza in uscita: `OUTBOUND_ALLOWED_HOSTS`

La consegna delle notifiche valida i target di Webhook personalizzato, Email API e SMTP. Per impostazione predefinita sono consentiti solo URL HTTPS pubblici e porte SMTP
comuni; se devi usare un relay self-hosted o un servizio e-mail fisso, puoi usare `OUTBOUND_ALLOWED_HOSTS` separato da virgole
per autorizzare esplicitamente gli host corrispondenti, ad esempio `relay.example.com,smtp.example.com`.
Dopo aver impostato questa variabile, il target in uscita della notifica deve corrispondere a un host dell’elenco o a un wildcard nella forma `*.example.com`.

I redirect HTTP vengono validati hop per hop e sono consentiti solo redirect same-origin. Quando `OUTBOUND_ALLOWED_HOSTS` non è configurato, vengono validati anche i risultati DNS
A/AAAA dell’host di destinazione, per verificare che non rientrino in localhost, rete interna, link-local, servizio metadata o intervalli di indirizzi riservati. `OUTBOUND_ALLOWED_HOSTS`
è un confine di fiducia esplicito definito dall’amministratore; i wildcard dovrebbero essere configurati solo sotto domini completamente controllati.

Il recupero reale degli argomenti Heybox è attualmente l’unica fonte dati runtime. Per impostazione predefinita `HEYBOX_SIGNATURE_MODE=app` usa la lista verificata degli orari di pubblicazione della App API;
`web` è mantenuto solo come fallback diagnostico.
I nuovi account partono con il polling disattivato e recuperano dati solo dopo aver attivato “Enable polling” nella loro pagina impostazioni.

## Relay notifiche

Se Oracle Cloud non può accedere direttamente a PushPlus, WxPusher o Server酱, puoi prima distribuire un relay Cloudflare Worker gratuito.
`workers/notification-relay.js` nel repository fornisce in modo fisso tre endpoint di inoltro: `/pushplus`, `/wxpusher` e `/serverchan`,
e usa `Authorization: Bearer <token>` per l’autenticazione; per i passaggi completi vedi [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verifica

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
