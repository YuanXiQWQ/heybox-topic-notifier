# Bereitstellungsanleitung

Der Deno-Dienst läuft auf Oracle Cloud hinter Caddy. Turso speichert Konten, Sitzungen und Treffer. GitHub Actions erstellt die Installationspakete für Windows und Android anhand der Release-Tags.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Laufzeit-Umgebungsvariablen

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Verwende für Tests eine eigene Datenbank. Beende zuerst die Abfragen auf dem bisherigen Server. Setze anschließend in der Produktionsumgebung `VM_POLLING_ENABLED=true` und starte den Dienst neu.

- Basis-Standardwerte: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Polling-Tuning: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox-Request-Overrides: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Gemeinsame Benachrichtigungsoptionen: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook-Benachrichtigung: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- E-Mail-Benachrichtigung: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Benachrichtigungs-Relay: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Sicherheits-Allowlist für ausgehende Verbindungen: `OUTBOUND_ALLOWED_HOSTS`

Die Zustellung von Benachrichtigungen validiert Ziele für benutzerdefinierte Webhooks, Email API und SMTP. Standardmäßig sind nur öffentliche HTTPS-URLs und gängige SMTP-
Ports erlaubt. Wenn Sie ein selbst gehostetes Relay oder einen festen Mail-Dienst verwenden müssen, können Sie mit der kommagetrennten Variable `OUTBOUND_ALLOWED_HOSTS`
die entsprechenden Hosts explizit erlauben, z. B. `relay.example.com,smtp.example.com`.
Nachdem diese Variable gesetzt wurde, muss das ausgehende Benachrichtigungsziel einen Host aus der Liste oder einen Platzhalter der Form `*.example.com` treffen.

HTTP-Weiterleitungen werden Hop für Hop validiert und erlauben nur Same-Origin-Weiterleitungen. Wenn `OUTBOUND_ALLOWED_HOSTS` nicht konfiguriert ist, wird zusätzlich geprüft, dass die DNS-
A/AAAA-Ergebnisse des Zielhosts nicht in Localhost-, Intranet-, Link-Local-, Metadata-Service- oder reservierte Adressbereiche fallen. `OUTBOUND_ALLOWED_HOSTS`
ist eine vom Administrator ausdrücklich gesetzte Vertrauensgrenze; Platzhalter sollten nur unter vollständig kontrollierten Domains konfiguriert werden.

Das Abrufen echter Heybox-Themen ist derzeit die einzige laufende Datenquelle. Standardmäßig verwendet `HEYBOX_SIGNATURE_MODE=app` die verifizierte Veröffentlichungsliste der App API;
`web` bleibt nur als diagnostischer Fallback erhalten.
Neue Konten starten mit deaktiviertem Polling und rufen erst ab, wenn „Polling aktivieren“ auf ihrer Einstellungsseite eingeschaltet wird.

## Benachrichtigungs-Relay

Wenn Oracle Cloud PushPlus, WxPusher oder Server酱 nicht direkt erreichen kann, kann zunächst ein kostenloses Cloudflare Worker-
Relay bereitgestellt werden. `workers/notification-relay.js` im Repository stellt fest `/pushplus`, `/wxpusher` und `/serverchan`
als drei Weiterleitungs-Endpunkte bereit und verwendet `Authorization: Bearer <token>` zur Authentifizierung; vollständige Schritte siehe [worker.md](worker.md).

Beispiel für die Konfiguration auf Deno-Deploy-Seite:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Überprüfung

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
