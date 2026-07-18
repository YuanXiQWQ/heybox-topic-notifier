# Istruzioni di deployment

Questo progetto usa l’integrazione GitHub di Deno Deploy per il deployment e non usa GitHub Actions per distribuire l’app. GitHub Actions esegue solo
`deno task check`, mentre Deno Deploy compila e instrada l’app dopo un push al repository.

## Deployment dei branch

Deno Deploy crea timeline diverse per la stessa App:

- `main`: deployment della release ufficiale, instradato alla Production URL
- `dev`: deployment di test prima della release, instradato alla Git Branch / DEV URL

Quando l’App corrente si chiama `heybox-topic-notifier`, la convenzione degli URL è indicativamente:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

L’attuale deployment di test `dev` è già stato creato, e l’ingresso stabile per i test è la Git Branch / DEV URL. I futuri push su `dev`
attiveranno l’aggiornamento del deployment di test, mentre i push su `main` attiveranno l’aggiornamento di Production.

L’integrazione GitHub di Deno Deploy può creare Git Branch timeline e Build per i push sui branch di funzionalità. Per evitare che Preview
e i normali branch di funzionalità leggano KV, recuperino Heybox o inviino notifiche ripetutamente, l’entrypoint di deployment dichiara Cron al livello superiore, ma l’handler prosegue l’esecuzione solo quando
`DENO_TIMELINE=production` oppure `DENO_TIMELINE=git-branch/dev`. Le normali richieste di pagina, il percorso root,
gli health check e le richieste Warm up
non attivano il polling automatico; le query in scadenza della pagina frontend inferiori a un minuto attivano la pianificazione dell’account corrente tramite un’interfaccia di stato controllata.

## Configurazione di Deno Deploy

Mantieni la seguente configurazione nella Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

La configurazione deploy in `deno.json` è l’unica fonte di configurazione lato repository per l’entrypoint di deployment.

## Database

La Deno Deploy App è già collegata a un database Deno KV. Il codice usa `Deno.openKv()`
per leggere e scrivere account, impostazioni, cronologia, stato di polling e marker dei post elaborati. Le password degli account sono salvate come hash PBKDF2 con salt; i dati utente sono isolati tramite prefisso user
ID, e Deno Deploy isola anche i dati Production e Git Branch in base alla timeline.

## Variabili d’ambiente runtime

Configura nella Deno Deploy App in base alle necessità. Il file `.env.example` nella root del repository è organizzato per scenari: per impostazione predefinita abilita solo la configurazione minima utilizzabile,
mentre le altre configurazioni di ottimizzazione del polling, canali di notifica, relay e allowlist di sicurezza restano commentate; decommenta le righe corrispondenti solo per lo scenario da usare.

- Valori predefiniti di base: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

L’app fornisce pagine di registrazione e accesso. Informazioni account, sessioni di accesso, e impostazioni, record di corrispondenza, stato di polling e configurazione notifiche di ogni account sono salvati in
Deno KV e isolati per user ID. Il cookie del browser salva solo un random session token; il server salva l’hash del token
e l’ora di scadenza.

Il recupero reale degli argomenti Heybox è attualmente l’unica fonte dati runtime. Per impostazione predefinita `HEYBOX_SIGNATURE_MODE=app` usa la lista verificata degli orari di pubblicazione della App API;
`web` è mantenuto solo come fallback diagnostico. `POLL_ENABLED`
serve solo come interruttore iniziale di polling per nuovi account o account predefinito; l’effettivo recupero dipende da “Enable polling” nella pagina impostazioni di ciascun account.

## Relay notifiche

Se Deno Deploy non può accedere direttamente a PushPlus, WxPusher o Server酱, puoi prima distribuire un relay Cloudflare Worker gratuito.
`workers/notification-relay.js` nel repository fornisce in modo fisso tre endpoint di inoltro: `/pushplus`, `/wxpusher` e `/serverchan`,
e usa `Authorization: Bearer <token>` per l’autenticazione; per i passaggi completi vedi [worker.md](worker.md).

Esempio di configurazione lato Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verifica

Al termine del deployment, visita:

```text
/healthz
```

Se restituisce `status: ok`, significa che il processo del servizio è stato avviato e l’health check non legge Deno KV.