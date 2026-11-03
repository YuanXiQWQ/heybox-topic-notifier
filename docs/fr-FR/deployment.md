# Instructions de déploiement

Le service Deno tourne sur Oracle Cloud derrière Caddy. Turso conserve les comptes, les sessions et les résultats. GitHub Actions construit les programmes d’installation Windows et Android à partir des tags de version.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Variables d’environnement d’exécution

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Utilisez une base distincte pour les essais. Après avoir arrêté la vérification périodique de l’ancien serveur, réglez `VM_POLLING_ENABLED=true` en production et redémarrez le service.

- Valeurs par défaut de base : `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Réglage du polling : `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Surcharge des requêtes Heybox : `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Options communes de notification : `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notifications Webhook : `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notifications e-mail : `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Relais de notification : `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Liste d’autorisation de sécurité sortante : `OUTBOUND_ALLOWED_HOSTS`

La livraison des notifications valide les cibles Webhook personnalisées, Email API et SMTP. Par défaut, seules les URL HTTPS publiques et les ports SMTP
courants sont autorisés ; si vous devez utiliser un relais auto-hébergé ou un service e-mail fixe, vous pouvez utiliser `OUTBOUND_ALLOWED_HOSTS` séparé par des virgules
pour autoriser explicitement les hôtes correspondants, par exemple `relay.example.com,smtp.example.com`.
Après avoir défini cette variable, la cible sortante de notification doit correspondre à un hôte de la liste ou à un joker de la forme `*.example.com`.

Les redirections HTTP sont validées saut par saut, et seules les redirections de même origine sont autorisées. Lorsque `OUTBOUND_ALLOWED_HOSTS` n’est pas configuré, les résultats DNS
A/AAAA de l’hôte cible sont également vérifiés afin qu’ils ne tombent pas dans les plages localhost, réseau interne, link-local, service de métadonnées ou adresses réservées. `OUTBOUND_ALLOWED_HOSTS`
est une limite de confiance explicite définie par l’administrateur ; les jokers ne doivent être configurés que sous des domaines entièrement contrôlés.

La récupération réelle des sujets Heybox est actuellement la seule source de données en exécution. Par défaut, `HEYBOX_SIGNATURE_MODE=app` utilise la liste des horaires de publication de l’App API vérifiée ;
`web` est conservé uniquement comme solution de repli de diagnostic.
Les nouveaux comptes démarrent avec le polling désactivé et ne récupèrent des données qu’après avoir activé « activer le polling » sur leur page de paramètres.

## Relais de notification

Si Oracle Cloud ne peut pas accéder directement à PushPlus, WxPusher ou Server酱, vous pouvez d’abord déployer un relais Cloudflare Worker gratuit.
Le fichier `workers/notification-relay.js` du dépôt fournit de façon fixe trois points d’entrée de transfert : `/pushplus`, `/wxpusher` et `/serverchan`,
et utilise `Authorization: Bearer <token>` pour l’authentification ; les étapes complètes sont dans [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Vérification

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
