# Notificateur de sujets Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Français** |
|:-----------------------:|:------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
est une application Deno légère destinée à surveiller les publications de sujets Heybox. Elle lit
périodiquement les publications réelles des sujets selon les paramètres de chaque compte, vérifie les
titres, les corps de texte, les commentaires et les réponses à l’aide de règles de mots-clés, enregistre
les correspondances dans les vues en attente et historique, puis envoie des notifications via le canal
configuré.

## Fonctionnalités

- Tableau de bord : consulter l’état du polling, le nombre total de correspondances, la dernière
  correspondance et les correspondances en attente, avec une action de vérification manuelle
- Page des paramètres : configurer les ID de sujets, l’état d’activation, les notes, l’unité de
  l’intervalle de polling, la limite de publications, le mode de tri, la langue de l’interface, le mode
  sombre et la couleur du thème
- Paramètres du compte : inscription, connexion, déconnexion, mise à jour du nom d’utilisateur et du mot
  de passe ; les données de compte sont isolées par ID utilisateur
- Règles de mots-clés : prise en charge des règles partagées, des règles propres à un sujet, des
  emplacements de correspondance, de la sensibilité à la casse et des expressions régulières
- Tableaux de correspondances : les enregistrements en attente et historiques prennent tous deux en
  charge les filtres par plage temporelle, la pagination, la finalisation par lot et les actions de
  suppression
- Entrées de débogage : correspondances simulées et tests de notification, avec des limites de débit côté
  serveur pour le polling manuel et les opérations de débogage
- Canaux de notification : Webhook personnalisé, ServerChan, PushPlus, WxPusher, API e-mail et SMTP
- Relais de notification : relais Cloudflare Worker optionnel pour PushPlus, WxPusher et ServerChan
- Sécurité : hachages de mots de passe PBKDF2, sessions adossées à KV, jetons CSRF, en-têtes de sécurité,
  journaux d’audit et liste d’autorisation sortante avec validation DNS

## Stack technique

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + planificateur local par minuteur
- HTML rendu côté serveur + JavaScript/CSS natifs
- Script Cloudflare Workers de relais de notifications

## Développement local

Démarrez le serveur de développement :

```powershell
deno task dev
```

Puis ouvrez :

```text
http://localhost:8000
```

Pour remplacer les valeurs par défaut, utilisez `.env.example` comme référence et définissez les variables
d’environnement correspondantes dans votre environnement d’exécution. Inscrivez un compte lors de la
première visite ; les variables d’environnement ne servent qu’à initialiser les valeurs par défaut pour
les nouveaux comptes ou les données par défaut, puis la page de paramètres de chaque compte devient la
source de vérité.

L’application fournit des pages d’inscription et de connexion. Chaque compte possède des paramètres, un
historique de correspondances, un état de polling et une configuration de notification isolés, de sorte
que les utilisateurs partageant la même URL de déploiement ne partagent pas leurs données. Les mots de
passe des utilisateurs sont stockés dans Deno KV sous forme de hachages PBKDF2 salés, et non en clair.
Les sessions de connexion sont stockées dans Deno KV, et le cookie du navigateur ne contient qu’un jeton
de session aléatoire. Les modifications des paramètres, du compte et du débogage valident un jeton CSRF,
et les opérations sensibles sont soumises à des limites de débit sur les déploiements publics.

## Commandes

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` efface les marqueurs de publications traitées afin que les mêmes publications puissent être
vérifiées à nouveau ; utilisez-le avec prudence en production.

## Déploiement

Consultez [deployment](./deployment.md) pour la configuration de Deno Deploy. Le point d’entrée de
l’application est défini par la section `deploy` dans `deno.json` ; GitHub Actions exécute uniquement les
vérifications et ne déploie pas l’application. Le point d’entrée de déploiement dans `src/deploy.ts`
déclare le Cron Deno Deploy, et le polling réel ne s’exécute que sur Production et sur la chronologie de
la branche Git `dev`. Consultez [worker](./worker.md) pour la configuration du Worker de relais de
notifications.

## Licence

Ce projet est sous licence [GNU Affero General Public License v3.0](../../LICENSE).