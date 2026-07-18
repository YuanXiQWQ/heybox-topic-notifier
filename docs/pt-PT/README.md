# Notificador de tópicos Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Português (Portugal)** |
|:-----------------------:|:------------------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
é uma aplicação Deno leve para monitorizar publicações de tópicos do Heybox. Lê periodicamente publicações
reais de tópicos de acordo com as definições de cada conta, verifica títulos, corpos, comentários e respostas
com regras de palavras-chave, regista correspondências nas vistas de pendentes e histórico, e envia notificações
através do canal configurado.

## Funcionalidades

- Painel: ver o estado da sondagem, o total de correspondências, a correspondência mais recente e as
  correspondências pendentes, com uma ação de verificação manual
- Página de definições: configurar IDs de tópicos, estado de ativação, notas, unidade do intervalo de
  sondagem, limite de publicações, modo de ordenação, idioma da interface, modo escuro e cor do tema
- Definições da conta: registar, iniciar sessão, terminar sessão, atualizar nome de utilizador e atualizar
  palavra-passe; os dados da conta são isolados por ID de utilizador
- Regras de palavras-chave: suporte para regras partilhadas, regras específicas de tópico, locais de
  correspondência, sensibilidade a maiúsculas/minúsculas e expressões regulares
- Tabelas de correspondências: os registos pendentes e de histórico suportam filtros por intervalo temporal,
  paginação, conclusão em lote e ações de eliminação
- Entradas de depuração: correspondências simuladas e testes de notificação, com limites de taxa do lado do
  servidor para sondagem manual e operações de depuração
- Canais de notificação: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de e-mail e SMTP
- Retransmissão de notificações: relay opcional do Cloudflare Worker para PushPlus, WxPusher e ServerChan
- Segurança: hashes de palavra-passe PBKDF2, sessões apoiadas por KV, tokens CSRF, cabeçalhos de segurança,
  registos de auditoria e allowlist de saída com validação DNS

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

Para substituir os valores predefinidos, use `.env.example` como referência e defina as variáveis de
ambiente correspondentes no seu ambiente de execução. Registe uma conta na primeira visita; as variáveis
de ambiente apenas inicializam valores predefinidos para novas contas ou dados predefinidos, e depois a
página de definições de cada conta torna-se a fonte da verdade.

A aplicação disponibiliza páginas de registo e início de sessão. Cada conta tem definições, histórico de
correspondências, estado de sondagem e configuração de notificações isolados, pelo que utilizadores que
partilham o mesmo URL de implementação não partilham dados. As palavras-passe dos utilizadores são guardadas
no Deno KV como hashes PBKDF2 com salt, não em texto simples. As sessões de início de sessão são guardadas
no Deno KV, e o cookie do navegador contém apenas um token de sessão aleatório. As alterações de definições,
conta e depuração validam um token CSRF, e as operações sensíveis têm limite de taxa em implementações públicas.

## Comandos

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` limpa os marcadores de publicações processadas para que as mesmas publicações possam ser
verificadas novamente; use-o com cuidado em produção.

## Implementação

Consulte [deployment](./deployment.md) para a configuração do Deno Deploy. O ponto de entrada da aplicação é
definido pela secção `deploy` em `deno.json`; o GitHub Actions apenas executa verificações e não implementa
a aplicação. O ponto de entrada de implementação em `src/deploy.ts` declara o Deno Deploy Cron, e a sondagem
real só é executada em Production e na linha temporal do Git Branch `dev`. Consulte [worker](./worker.md)
para configurar o Worker de retransmissão de notificações.

## Licença

Este projeto está licenciado ao abrigo da [GNU Affero General Public License v3.0](../../LICENSE).