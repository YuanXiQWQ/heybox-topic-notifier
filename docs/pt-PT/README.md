# Notificador de tópicos Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Português (Portugal)** |
|:-----------------------:|:------------------------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Adicione um tópico do Heybox nas definições, escolha palavras-chave, expressões regulares ou filtros de IA e ative a consulta periódica. Pode mover os resultados para o histórico e repô-los na área de trabalho.

As novas contas exigem um código de convite. As notificações da aplicação são ativadas por dispositivo e podem ser usadas com correio eletrónico ou webhook. As alterações offline são sincronizadas quando a ligação é restabelecida. Por predefinição, o idioma e o modo escuro seguem o dispositivo.

## Funcionalidades

- Painel: ver o estado da sondagem, o total de correspondências, a correspondência mais recente e as
  correspondências pendentes, com uma ação de verificação manual
- Página de definições: configurar IDs de tópicos, estado de ativação, notas, unidade do intervalo de
  sondagem, limite de publicações, modo de ordenação, idioma da interface, modo escuro e cor do tema
- Definições da conta: registar, iniciar sessão, terminar sessão, atualizar nome de utilizador e atualizar
  palavra-passe; os dados da conta são isolados por ID de utilizador
- Regras de palavras-chave: suporte para regras partilhadas, regras específicas de tópico, locais de
  correspondência, sensibilidade a maiúsculas/minúsculas e expressões regulares
- Definições → Definições de notificação → Testar notificação
- Canais de notificação: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de e-mail e SMTP
- Retransmissão de notificações: relay opcional do Cloudflare Worker para PushPlus, WxPusher e ServerChan

## Desenvolvimento local

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Implementação

O serviço Deno corre na Oracle Cloud com HTTPS fornecido pelo Caddy. O Turso guarda contas, sessões e resultados. O GitHub Actions gera os instaladores para Windows e Android a partir das etiquetas de versão.

[Alojamento próprio](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licença

Este projeto está licenciado ao abrigo da [GNU Affero General Public License v3.0](../../LICENSE).
