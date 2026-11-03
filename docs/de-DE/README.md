# Heybox-Themenbenachrichtiger

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Deutsch** |
|:-----------------------:|:-----------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Füge in den Einstellungen ein Heybox-Thema hinzu, wähle Schlüsselwörter, reguläre Ausdrücke oder KI-Filter und aktiviere die regelmäßige Abfrage. Treffer lassen sich vom Arbeitsbereich in den Verlauf und wieder zurück verschieben.

Für neue Konten ist ein Einladungscode erforderlich. App-Benachrichtigungen werden pro Gerät aktiviert und lassen sich mit E-Mail oder Webhook kombinieren. Offline-Änderungen werden beim nächsten Verbinden synchronisiert. Sprache und Dunkelmodus folgen standardmäßig dem Gerät.

## Funktionen

- Dashboard: Polling-Status, Gesamtzahl der Treffer, neuesten Treffer und ausstehende Treffer anzeigen,
  mit einer manuellen Prüfaktion
- Einstellungsseite: Themen-IDs, Aktivierungsstatus, Notizen, Einheit des Polling-Intervalls,
  Beitragslimit, Sortiermodus, UI-Sprache, Dunkelmodus und Designfarbe konfigurieren
- Kontoeinstellungen: registrieren, anmelden, abmelden, Benutzernamen aktualisieren und Passwort
  aktualisieren; Kontodaten werden nach Benutzer-ID isoliert
- Schlüsselwortregeln: Unterstützung für gemeinsame Regeln, themenspezifische Regeln, Trefferorte,
  Groß-/Kleinschreibung und reguläre Ausdrücke
- Einstellungen → Benachrichtigungseinstellungen → Testbenachrichtigung
- Benachrichtigungskanäle: benutzerdefinierter Webhook, ServerChan, PushPlus, WxPusher, E-Mail-API
  und SMTP
- Benachrichtigungsweiterleitung: optionaler Cloudflare-Worker-Relay für PushPlus, WxPusher und ServerChan

## Lokale Entwicklung

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Deployment

Der Deno-Dienst läuft auf Oracle Cloud hinter Caddy. Turso speichert Konten, Sitzungen und Treffer. GitHub Actions erstellt die Installationspakete für Windows und Android anhand der Release-Tags.

[Selbst hosten](./deployment.md) · [Cloudflare Worker](./worker.md)

## Lizenz

Dieses Projekt ist unter der [GNU Affero General Public License v3.0](../../LICENSE) lizenziert.
