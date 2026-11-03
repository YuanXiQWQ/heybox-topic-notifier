# Notificatore di argomenti Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Italiano** |
|:-----------------------:|:------------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Aggiungi un argomento Heybox nelle impostazioni, scegli parole chiave, espressioni regolari o filtri IA e attiva il controllo periodico. Puoi spostare i risultati nella cronologia e riportarli nell’area di lavoro.

Per creare un account serve un codice di invito. Le notifiche dell’app si attivano per dispositivo e possono affiancare email o webhook. Le modifiche offline si sincronizzano alla riconnessione. Lingua e modalità scura seguono inizialmente il dispositivo.

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
- Impostazioni → Impostazioni notifiche → Prova notifica
- Canali di notifica: Webhook personalizzato, ServerChan, PushPlus, WxPusher, email API e SMTP
- Relay delle notifiche: relay Cloudflare Worker opzionale per PushPlus, WxPusher e ServerChan

## Sviluppo locale

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Il servizio Deno è ospitato su Oracle Cloud e usa Caddy per HTTPS. Turso conserva account, sessioni e risultati. GitHub Actions crea i pacchetti di installazione per Windows e Android dai tag di rilascio.

[Installazione sul proprio server](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licenza

Questo progetto è concesso in licenza sotto la [GNU Affero General Public License v3.0](../../LICENSE).
