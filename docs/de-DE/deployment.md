# Bereitstellungsanleitung

Dieses Projekt wird über die GitHub-Integration von Deno Deploy bereitgestellt und verwendet GitHub Actions nicht zum Deployment der App. GitHub Actions führt nur
`deno task check` aus; Deno Deploy übernimmt nach einem Push in das Repository den Build und das Routing der App.

## Branch-Deployments

Deno Deploy erstellt für dieselbe App unterschiedliche Timelines:

- `main`: offizielles Release-Deployment, geroutet zur Production URL
- `dev`: Test-Deployment vor dem Release, geroutet zur Git Branch / DEV URL

Wenn die aktuelle App `heybox-topic-notifier` heißt, gilt ungefähr folgende URL-Konvention:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Das aktuelle `dev`-Test-Deployment ist bereits eingerichtet; der stabile Test-Einstiegspunkt ist die Git Branch / DEV URL. Weitere Pushes nach `dev`
lösen ein Update des Test-Deployments aus, während Pushes nach `main` Production aktualisieren.

Die GitHub-Integration von Deno Deploy kann bei Pushes auf Feature-Branches Git Branch Timelines und Builds erstellen. Damit Preview
und gewöhnliche Feature-Branches nicht wiederholt KV lesen, Heybox abrufen oder Benachrichtigungen senden, deklariert der Deployment-Einstiegspunkt Cron auf Top-Level, aber der Handler fährt nur fort, wenn
`DENO_TIMELINE=production` oder `DENO_TIMELINE=git-branch/dev` gesetzt ist. Normale Seitenanfragen, der Root-Pfad,
Health Checks und Warm-up-
Anfragen lösen kein automatisches Polling aus; fällige Abfragen der Frontend-Seite unter einer Minute triggern die Planung des aktuellen Kontos über eine kontrollierte Statusschnittstelle.

## Deno-Deploy-Konfiguration

Behalten Sie in der Deno Deploy App folgende Konfiguration bei:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

Die deploy-Konfiguration in `deno.json` ist die einzige Repository-Konfigurationsquelle für den Deployment-Einstiegspunkt.

## Datenbank

Die Deno Deploy App ist an eine Deno-KV-Datenbank gebunden. Der Code verwendet `Deno.openKv()`,
um Konten, Einstellungen, Verlauf, Polling-Status und Markierungen verarbeiteter Beiträge zu lesen und zu schreiben. Kontopasswörter werden als gesalzene PBKDF2-Hashes gespeichert; Benutzerdaten werden nach User-
ID-Präfix isoliert, und Deno Deploy isoliert außerdem Production- und Git-Branch-Daten nach Timeline.

## Laufzeit-Umgebungsvariablen

Konfigurieren Sie diese in der Deno Deploy App nach Bedarf. Die `.env.example` im Repository-Root ist nach Szenarien organisiert: Standardmäßig ist nur die minimal nutzbare Konfiguration aktiviert;
weitere Einstellungen für Polling-Tuning, Benachrichtigungskanäle, Relay und Sicherheits-Allowlist bleiben auskommentiert und werden je nach Szenario aktiviert.

- Basis-Standardwerte: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

Die App stellt Registrierungs- und Login-Seiten bereit. Kontoinformationen, Login-Sitzungen sowie Einstellungen, Trefferlisten, Polling-Status und Benachrichtigungskonfigurationen jedes Kontos werden in
Deno KV gespeichert und nach User ID isoliert. Das Browser-Cookie speichert nur ein zufälliges Session Token; der Server speichert Token-
Hash und Ablaufzeit.

Das Abrufen echter Heybox-Themen ist derzeit die einzige laufende Datenquelle. Standardmäßig verwendet `HEYBOX_SIGNATURE_MODE=app` die verifizierte Veröffentlichungsliste der App API;
`web` bleibt nur als diagnostischer Fallback erhalten. `POLL_ENABLED`
dient nur als anfänglicher Polling-Schalter für neue Konten oder das Standardkonto. Ob tatsächlich abgerufen wird, richtet sich nach „Polling aktivieren“ auf der Einstellungsseite des jeweiligen Kontos.

## Benachrichtigungs-Relay

Wenn Deno Deploy PushPlus, WxPusher oder Server酱 nicht direkt erreichen kann, kann zunächst ein kostenloses Cloudflare Worker-
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

Nach abgeschlossenem Deployment aufrufen:

```text
/healthz
```

Wenn `status: ok` zurückgegeben wird, ist der Dienstprozess gestartet; der Health Check liest dabei nicht aus Deno KV.