# Notificatore di argomenti Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Italiano** |
|:-----------------------:|:------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
è una leggera app Deno per monitorare i post degli argomenti Heybox. Legge periodicamente post reali
degli argomenti in base alle impostazioni di ciascun account, controlla titoli, corpi, commenti e risposte
rispetto alle regole di parole chiave, registra le corrispondenze nelle viste in sospeso e cronologia,
e invia notifiche tramite il canale configurato.

## Funzionalità

- Dashboard: visualizzazione dello stato del polling, del totale delle corrispondenze, dell’ultima
  corrispondenza e delle corrispondenze in sospeso, con azione di controllo manuale
- Pagina impostazioni: configurazione di ID argomento, stato di abilitazione, note, unità dell’intervallo
  di polling, limite dei post, modalità di ordinamento, lingua dell’interfaccia, modalità scura e colore
  del tema
- Impostazioni account: registrazione, accesso, disconnessione, aggiornamento del nome utente e
  aggiornamento della password; i dati dell’account sono isolati per ID utente
- Regole di parole chiave: supporto per regole condivise, regole specifiche per argomento, posizioni di
  corrispondenza, distinzione tra maiuscole e minuscole ed espressioni regolari
- Tabelle delle corrispondenze: i record in sospeso e quelli della cronologia supportano entrambi filtri
  per intervallo temporale, paginazione, completamento in batch e azioni di eliminazione
- Voci di debug: corrispondenze simulate e test di notifica, con limiti di frequenza lato server per
  polling manuale e operazioni di debug
- Canali di notifica: Webhook personalizzato, ServerChan, PushPlus, WxPusher, email API e SMTP
- Relay delle notifiche: relay Cloudflare Worker opzionale per PushPlus, WxPusher e ServerChan
- Sicurezza: hash delle password PBKDF2, sessioni basate su KV, token CSRF, header di sicurezza,
  log di audit e allowlist in uscita con validazione DNS

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + scheduler timer locale
- HTML renderizzato lato server + JavaScript/CSS vanilla
- Script Cloudflare Workers per il relay delle notifiche

## Sviluppo locale

Avvia il server di sviluppo:

```powershell
deno task dev
```

Poi apri:

```text
http://localhost:8000
```

Per sovrascrivere i valori predefiniti, usa `.env.example` come riferimento e imposta le variabili
d’ambiente corrispondenti nel tuo ambiente di runtime. Registra un account alla prima visita; le variabili
d’ambiente inizializzano solo i valori predefiniti per nuovi account o dati predefiniti, dopodiché la
pagina delle impostazioni di ciascun account diventa la fonte di verità.

L’app fornisce pagine di registrazione e accesso. Ogni account ha impostazioni, cronologia delle
corrispondenze, stato di polling e configurazione delle notifiche isolati, quindi gli utenti che condividono
lo stesso URL di deployment non condividono dati. Le password utente sono memorizzate in Deno KV come hash
PBKDF2 con salt, non in chiaro. Le sessioni di accesso sono memorizzate in Deno KV e il cookie del browser
contiene solo un token di sessione casuale. Le modifiche a impostazioni, account e debug convalidano un
token CSRF, e le operazioni sensibili sono soggette a limiti di frequenza nei deployment pubblici.

## Comandi

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` elimina i marker dei post elaborati, così gli stessi post possono essere verificati di nuovo;
usalo con cautela in produzione.

## Deployment

Vedi [deployment](./deployment.md) per la configurazione di Deno Deploy. L’entrypoint dell’app è definito
dalla sezione `deploy` in `deno.json`; GitHub Actions esegue solo i controlli e non effettua il deployment
dell’app. L’entrypoint di deployment in `src/deploy.ts` dichiara il Cron di Deno Deploy, e il polling reale
viene eseguito solo su Production e sulla timeline del Git Branch `dev`. Vedi [worker](./worker.md) per la
configurazione del Worker di relay delle notifiche.

## Licenza

Questo progetto è concesso in licenza sotto la [GNU Affero General Public License v3.0](../../LICENSE).