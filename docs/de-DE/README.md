# Heybox-Themenbenachrichtiger

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Deutsch** |
|:-----------------------:|:-----------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
ist eine schlanke Deno-App zur Überwachung von Heybox-Themenbeiträgen. Sie liest regelmäßig echte
Themenbeiträge entsprechend den Einstellungen jedes Kontos, prüft Titel, Inhalte, Kommentare und
Antworten anhand von Schlüsselwortregeln, zeichnet Treffer in den Ansichten „Ausstehend“ und
„Verlauf“ auf und sendet Benachrichtigungen über den konfigurierten Kanal.

## Funktionen

- Dashboard: Polling-Status, Gesamtzahl der Treffer, neuesten Treffer und ausstehende Treffer anzeigen,
  mit einer manuellen Prüfaktion
- Einstellungsseite: Themen-IDs, Aktivierungsstatus, Notizen, Einheit des Polling-Intervalls,
  Beitragslimit, Sortiermodus, UI-Sprache, Dunkelmodus und Designfarbe konfigurieren
- Kontoeinstellungen: registrieren, anmelden, abmelden, Benutzernamen aktualisieren und Passwort
  aktualisieren; Kontodaten werden nach Benutzer-ID isoliert
- Schlüsselwortregeln: Unterstützung für gemeinsame Regeln, themenspezifische Regeln, Trefferorte,
  Groß-/Kleinschreibung und reguläre Ausdrücke
- Treffertabellen: Ausstehende Einträge und Verlaufseinträge unterstützen beide Zeitbereichsfilter,
  Paginierung, stapelweises Abschließen und Löschaktionen
- Debug-Einträge: simulierte Treffer und Benachrichtigungstests, mit serverseitigen Rate Limits für
  manuelles Polling und Debug-Vorgänge
- Benachrichtigungskanäle: benutzerdefinierter Webhook, ServerChan, PushPlus, WxPusher, E-Mail-API
  und SMTP
- Benachrichtigungsweiterleitung: optionaler Cloudflare-Worker-Relay für PushPlus, WxPusher und ServerChan
- Sicherheit: PBKDF2-Passwort-Hashes, KV-gestützte Sitzungen, CSRF-Tokens, Sicherheitsheader,
  Audit-Logs sowie ausgehende Allowlist mit DNS-Validierung

## Technologie-Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + lokaler Timer-Scheduler
- Serverseitig gerendertes HTML + Vanilla JavaScript/CSS
- Cloudflare-Workers-Skript zur Benachrichtigungsweiterleitung

## Lokale Entwicklung

Entwicklungsserver starten:

```powershell
deno task dev
```

Dann öffnen:

```text
http://localhost:8000
```

Um die Standardwerte zu überschreiben, verwenden Sie `.env.example` als Referenz und setzen Sie die
entsprechenden Umgebungsvariablen in Ihrer Laufzeitumgebung. Registrieren Sie beim ersten Besuch ein
Konto; Umgebungsvariablen setzen nur Standardwerte für neue Konten oder Standarddaten, und danach
wird die Einstellungsseite jedes Kontos zur maßgeblichen Quelle.

Die App stellt Registrierungs- und Anmeldeseiten bereit. Jedes Konto verfügt über isolierte Einstellungen,
einen eigenen Trefferverlauf, einen eigenen Polling-Status und eine eigene Benachrichtigungskonfiguration,
sodass Benutzer, die dieselbe Deployment-URL verwenden, keine Daten gemeinsam nutzen. Benutzerpasswörter
werden in Deno KV als gesalzene PBKDF2-Hashes gespeichert, nicht als Klartext. Anmeldesitzungen werden
in Deno KV gespeichert, und das Browser-Cookie enthält nur ein zufälliges Sitzungstoken. Änderungen an
Einstellungen, Konto und Debug-Funktionen validieren ein CSRF-Token, und sensible Vorgänge sind auf
öffentlichen Deployments rate-limitiert.

## Befehle

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` löscht Markierungen für bereits verarbeitete Beiträge, sodass dieselben Beiträge erneut
verifiziert werden können; verwenden Sie dies in der Produktion mit Vorsicht.

## Deployment

Siehe [deployment](./deployment.md) für die Einrichtung von Deno Deploy. Der Einstiegspunkt der App wird
durch den Abschnitt `deploy` in `deno.json` definiert; GitHub Actions führt nur Prüfungen aus und deployt
die App nicht. Der Deployment-Einstiegspunkt in `src/deploy.ts` deklariert den Deno Deploy Cron, und das
tatsächliche Polling läuft nur auf Production und auf der `dev`-Git-Branch-Timeline. Siehe
[worker](./worker.md) für die Einrichtung des Workers zur Benachrichtigungsweiterleitung.

## Lizenz

Dieses Projekt ist unter der [GNU Affero General Public License v3.0](../../LICENSE) lizenziert.