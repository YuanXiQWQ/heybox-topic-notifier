# Notificateur de sujets Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Français** |
| :-------------------------: | :----------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Ajoutez un sujet Heybox dans les réglages, choisissez des mots-clés, une expression régulière ou un filtre IA, puis activez la vérification périodique. Vous pouvez déplacer les résultats vers l’historique et les restaurer dans l’espace de travail.

Un code d’invitation est nécessaire pour créer un compte. Les notifications de l’application se règlent par appareil et peuvent accompagner les e-mails ou un webhook. Les modifications hors ligne sont synchronisées à la reconnexion. La langue et le mode sombre suivent par défaut les réglages de l’appareil.

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
- Paramètres → Paramètres de notification → Tester la notification
- Canaux de notification : Webhook personnalisé, ServerChan, PushPlus, WxPusher, API e-mail et SMTP
- Relais de notification : relais Cloudflare Worker optionnel pour PushPlus, WxPusher et ServerChan

## Développement local

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Déploiement

Le service Deno tourne sur Oracle Cloud derrière Caddy. Turso conserve les comptes, les sessions et les résultats. GitHub Actions construit les programmes d’installation Windows et Android à partir des tags de version.

[Auto-hébergement](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licence

Ce projet est sous licence [GNU Affero General Public License v3.0](../../LICENSE).
