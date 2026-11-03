# Notificador de tópicos Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Português (Brasil)** |
|:-----------------------:|:----------------------:|

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Adicione um tópico do Heybox nas configurações, escolha palavras-chave, expressões regulares ou filtros de IA e ative a consulta periódica. Os resultados podem ser movidos para o histórico e restaurados na área de trabalho.

Novas contas exigem um código de convite. As notificações do aplicativo são ativadas por dispositivo e podem ser usadas com e-mail ou webhook. As alterações offline são sincronizadas ao reconectar. Por padrão, o idioma e o modo escuro seguem o dispositivo.

## Recursos

- Painel: visualize o status da verificação, o total de correspondências, a correspondência mais recente
  e as correspondências pendentes, com uma ação de verificação manual
- Página de configurações: configure IDs de tópicos, estado de ativação, notas, unidade do intervalo de
  verificação, limite de publicações, modo de ordenação, idioma da interface, modo escuro e cor do tema
- Configurações da conta: registre-se, entre, saia, atualize o nome de usuário e atualize a senha; os
  dados da conta são isolados por ID de usuário
- Regras de palavras-chave: suporte a regras compartilhadas, regras específicas por tópico, locais de
  correspondência, diferenciação entre maiúsculas e minúsculas e expressões regulares
- Configurações → Configurações de notificação → Testar notificação
- Canais de notificação: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de e-mail e SMTP
- Retransmissão de notificações: relay opcional do Cloudflare Worker para PushPlus, WxPusher e ServerChan

## Desenvolvimento local

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Implantação

O serviço Deno roda na Oracle Cloud com HTTPS fornecido pelo Caddy. O Turso armazena contas, sessões e resultados. O GitHub Actions gera os instaladores para Windows e Android a partir das tags de versão.

[Hospedagem própria](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licença

Este projeto é licenciado sob a [GNU Affero General Public License v3.0](../../LICENSE).
