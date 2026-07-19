# Instructions de déploiement

Ce projet est déployé avec l’intégration GitHub de Deno Deploy, et n’utilise pas GitHub Actions pour déployer l’application. GitHub Actions exécute uniquement
`deno task check`; Deno Deploy se charge de compiler et de router l’application après un push vers le dépôt.

## Déploiement par branches

Deno Deploy crée différents timelines pour une même App :

- `main` : déploiement de version officielle, routé vers la Production URL
- `dev` : déploiement de test avant publication, routé vers la Git Branch / DEV URL

Lorsque l’App actuelle s’appelle `heybox-topic-notifier`, la convention d’URL est approximativement :

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

Le déploiement de test actuel de `dev` est déjà créé, et le point d’entrée de test stable est la Git Branch / DEV URL. Les prochains push vers `dev`
déclencheront la mise à jour du déploiement de test, tandis que les push vers `main` déclencheront la mise à jour de Production.

L’intégration GitHub de Deno Deploy peut créer des Git Branch timelines et des Builds pour les push sur les branches de fonctionnalités. Pour éviter que Preview
et les branches de fonctionnalités ordinaires lisent KV, récupèrent Heybox ou envoient des notifications en double, le point d’entrée de déploiement déclare Cron au niveau supérieur, mais le handler ne continue que lorsque
`DENO_TIMELINE=production` ou `DENO_TIMELINE=git-branch/dev`. Les requêtes de pages ordinaires, le chemin racine,
les contrôles de santé et les requêtes Warm up
ne déclenchent pas de polling automatique ; les vérifications d’échéance côté interface, inférieures à une minute, déclenchent la planification du compte courant via une interface d’état contrôlée.

## Configuration de Deno Deploy

Conservez la configuration suivante dans la Deno Deploy App :

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

La configuration `deploy` dans `deno.json` est l’unique source de configuration du dépôt pour le point d’entrée de déploiement.

## Base de données

La Deno Deploy App est déjà liée à une base de données Deno KV. Le code utilise `Deno.openKv()`
pour lire et écrire les comptes, les paramètres, l’historique, l’état de polling et les marqueurs de publications traitées. Les mots de passe des comptes sont stockés sous forme de hachages PBKDF2 salés ; les données utilisateur sont isolées par préfixe d’user
ID, et Deno Deploy isole également les données Production et Git Branch par timeline.

## Variables d’environnement d’exécution

Configurez-les dans la Deno Deploy App selon les besoins. Le fichier `.env.example` à la racine du dépôt est organisé par scénario : par défaut, seule la configuration minimale utilisable est activée,
et les autres paramètres de réglage du polling, de canaux de notification, de relais et de liste d’autorisation de sécurité restent commentés. Décommentez les lignes correspondantes selon le scénario utilisé.

- Valeurs par défaut de base : `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

L’application fournit des pages d’inscription et de connexion. Les informations de compte, les sessions de connexion, ainsi que les paramètres, enregistrements de correspondances, état de polling et configuration de notification de chaque compte sont stockés dans
Deno KV et isolés par user ID. Le cookie du navigateur ne stocke qu’un session token aléatoire ; le serveur stocke le hash du token
et l’heure d’expiration.

La récupération réelle des sujets Heybox est actuellement la seule source de données en exécution. Par défaut, `HEYBOX_SIGNATURE_MODE=app` utilise la liste des horaires de publication de l’App API vérifiée ;
`web` est conservé uniquement comme solution de repli de diagnostic. `POLL_ENABLED`
sert uniquement d’interrupteur initial de polling pour les nouveaux comptes ou le compte par défaut ; la récupération effective dépend de l’option « activer le polling » dans la page de paramètres de chaque compte.

## Relais de notification

Si Deno Deploy ne peut pas accéder directement à PushPlus, WxPusher ou Server酱, vous pouvez d’abord déployer un relais Cloudflare Worker gratuit.
Le fichier `workers/notification-relay.js` du dépôt fournit de façon fixe trois points d’entrée de transfert : `/pushplus`, `/wxpusher` et `/serverchan`,
et utilise `Authorization: Bearer <token>` pour l’authentification ; les étapes complètes sont dans [worker.md](worker.md).

Exemple de configuration côté Deno Deploy :

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Vérification

Une fois le déploiement terminé, accédez à :

```text
/healthz
```

Le retour `status: ok` signifie que le processus du service a démarré et que le contrôle de santé ne lit pas Deno KV.