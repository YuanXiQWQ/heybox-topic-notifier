# Notificador de tópicos Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Português (Brasil)** |
|:-----------------------:|:----------------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
é um aplicativo Deno leve para monitorar publicações de tópicos do Heybox. Ele lê periodicamente
publicações reais de tópicos conforme as configurações de cada conta, verifica títulos, corpos,
comentários e respostas com base em regras de palavras-chave, registra correspondências nas visualizações
de pendentes e histórico, e envia notificações pelo canal configurado.

## Recursos

- Painel: visualize o status da verificação, o total de correspondências, a correspondência mais recente
  e as correspondências pendentes, com uma ação de verificação manual
- Página de configurações: configure IDs de tópicos, estado de ativação, notas, unidade do intervalo de
  verificação, limite de publicações, modo de ordenação, idioma da interface, modo escuro e cor do tema
- Configurações da conta: registre-se, entre, saia, atualize o nome de usuário e atualize a senha; os
  dados da conta são isolados por ID de usuário
- Regras de palavras-chave: suporte a regras compartilhadas, regras específicas por tópico, locais de
  correspondência, diferenciação entre maiúsculas e minúsculas e expressões regulares
- Tabelas de correspondências: registros pendentes e de histórico oferecem suporte a filtros por intervalo
  de tempo, paginação, conclusão em lote e ações de exclusão
- Entradas de depuração: correspondências simuladas e testes de notificação, com limites de taxa no lado
  do servidor para verificação manual e operações de depuração
- Canais de notificação: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de e-mail e SMTP
- Retransmissão de notificações: relay opcional do Cloudflare Worker para PushPlus, WxPusher e ServerChan
- Segurança: hashes de senha PBKDF2, sessões baseadas em KV, tokens CSRF, cabeçalhos de segurança,
  logs de auditoria e allowlist de saída com validação DNS

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + agendador por temporizador local
- HTML renderizado no servidor + JavaScript/CSS puro
- Script do Cloudflare Workers para retransmissão de notificações

## Desenvolvimento local

Inicie o servidor de desenvolvimento:

```powershell
deno task dev
```

Depois abra:

```text
http://localhost:8000
```

Para substituir os valores padrão, use `.env.example` como referência e defina as variáveis de ambiente
correspondentes no seu ambiente de execução. Registre uma conta na primeira visita; as variáveis de ambiente
apenas inicializam padrões para novas contas ou dados padrão, e a página de configurações de cada conta se
torna a fonte da verdade depois disso.

O aplicativo fornece páginas de registro e login. Cada conta tem configurações, histórico de correspondências,
estado de verificação e configuração de notificações isolados, portanto usuários que compartilham a mesma URL
de implantação não compartilham dados. As senhas dos usuários são armazenadas no Deno KV como hashes PBKDF2
com salt, não em texto puro. As sessões de login são armazenadas no Deno KV, e o cookie do navegador contém
apenas um token de sessão aleatório. Alterações em configurações, conta e depuração validam um token CSRF,
e operações sensíveis têm limite de taxa em implantações públicas.

## Comandos

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` limpa os marcadores de publicações processadas para que as mesmas publicações possam ser
verificadas novamente; use com cuidado em produção.

## Implantação

Consulte [deployment](./deployment.md) para configurar o Deno Deploy. O ponto de entrada do aplicativo é
definido pela seção `deploy` em `deno.json`; o GitHub Actions apenas executa verificações e não implanta
o aplicativo. O ponto de entrada de implantação em `src/deploy.ts` declara o Deno Deploy Cron, e a
verificação real só é executada em Production e na linha do tempo do Git Branch `dev`. Consulte
[worker](./worker.md) para configurar o Worker de retransmissão de notificações.

## Licença

Este projeto é licenciado sob a [GNU Affero General Public License v3.0](../../LICENSE).