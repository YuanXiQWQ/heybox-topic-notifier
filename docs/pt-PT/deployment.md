# Instruções de implementação

Este projeto usa a integração GitHub do Deno Deploy para implementação e não usa GitHub Actions para implementar a aplicação. O GitHub Actions apenas executa
`deno task check`; o Deno Deploy fica responsável por compilar e encaminhar a aplicação após um push para o repositório.

## Implementação por branches

O Deno Deploy cria timelines diferentes para a mesma App:

- `main`: implementação da versão oficial, encaminhada para o Production URL
- `dev`: implementação de teste antes do lançamento, encaminhada para o Git Branch / DEV URL

Quando a App atual se chama `heybox-topic-notifier`, a convenção de URL é aproximadamente:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

A implementação de teste atual de `dev` já foi criada, e a entrada estável de teste é o Git Branch / DEV URL. Pushes futuros para `dev`
acionarão a atualização da implementação de teste, enquanto pushes para `main` acionarão a atualização de Production.

A integração GitHub do Deno Deploy pode criar Git Branch timelines e Builds para pushes em branches de funcionalidades. Para evitar que Preview
e branches normais de funcionalidades leiam KV, obtenham dados do Heybox ou enviem notificações repetidamente, o entrypoint de implementação declara Cron ao nível superior, mas o handler só continua a execução quando
`DENO_TIMELINE=production` ou `DENO_TIMELINE=git-branch/dev`. Pedidos normais de página, o caminho raiz,
health checks e pedidos Warm up
não acionam polling automático; consultas vencidas da página frontend com menos de um minuto acionam o agendamento da conta atual através de uma interface de estado controlada.

## Configuração do Deno Deploy

Mantenha a seguinte configuração na Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

A configuração deploy em `deno.json` é a única fonte de configuração do repositório para o entrypoint de implementação.

## Base de dados

A Deno Deploy App já está associada a uma base de dados Deno KV. O código usa `Deno.openKv()`
para ler e escrever contas, definições, histórico, estado de polling e marcadores de publicações processadas. As palavras-passe das contas são guardadas como hashes PBKDF2 com salt; os dados de utilizador são isolados pelo prefixo user
ID, e o Deno Deploy também isola os dados de Production e Git Branch por timeline.

## Variáveis de ambiente de execução

Configure na Deno Deploy App conforme necessário. O `.env.example` na raiz do repositório está organizado por cenário: por predefinição, apenas a configuração mínima utilizável está ativada,
enquanto outras configurações de ajuste de polling, canais de notificação, retransmissão e allowlist de segurança permanecem comentadas; remova o comentário apenas das linhas correspondentes ao cenário que pretende usar.

- Valores predefinidos básicos: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
- Ajuste de polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Substituição de pedidos Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Itens comuns de notificação: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notificações Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notificações por e-mail: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Retransmissão de notificações: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist de segurança de saída: `OUTBOUND_ALLOWED_HOSTS`

A entrega de notificações valida destinos de Webhook personalizado, Email API e SMTP. Por predefinição, apenas URL HTTPS públicos e portas SMTP
comuns são permitidos; se precisar de usar uma retransmissão autoalojada ou um serviço de e-mail fixo, use `OUTBOUND_ALLOWED_HOSTS` separado por vírgulas
para permitir explicitamente os hosts correspondentes, por exemplo `relay.example.com,smtp.example.com`.
Depois de definir esta variável, o destino de saída da notificação deve corresponder a um host da lista ou a um wildcard no formato `*.example.com`.

Os redirecionamentos HTTP são validados salto a salto, e apenas redirecionamentos same-origin são permitidos. Quando `OUTBOUND_ALLOWED_HOSTS` não está configurado, os resultados DNS
A/AAAA do host de destino também são validados para garantir que não pertencem a localhost, rede interna, link-local, serviço de metadados ou intervalos de endereços reservados. `OUTBOUND_ALLOWED_HOSTS`
é uma fronteira de confiança explícita definida pelo administrador; wildcards só devem ser configurados sob domínios totalmente controlados.

A aplicação fornece páginas de registo e início de sessão. Informações de conta, sessões de início de sessão, bem como definições, registos de correspondência, estado de polling e configuração de notificações de cada conta são guardados no
Deno KV e isolados por user ID. O cookie do navegador guarda apenas um random session token; o servidor guarda o hash do token
e a hora de expiração.

A obtenção real de tópicos do Heybox é atualmente a única fonte de dados em execução. Por predefinição, `HEYBOX_SIGNATURE_MODE=app` usa a lista verificada de horas de publicação da App API;
`web` é mantido apenas como fallback de diagnóstico. `POLL_ENABLED`
serve apenas como interruptor inicial de polling para novas contas ou para a conta predefinida; a obtenção efetiva depende da opção “Enable polling” na página de definições de cada conta.

## Retransmissão de notificações

Se o Deno Deploy não conseguir aceder diretamente a PushPlus, WxPusher ou Server酱, pode primeiro implementar uma retransmissão gratuita com Cloudflare Worker.
O `workers/notification-relay.js` do repositório fornece de forma fixa três entradas de encaminhamento: `/pushplus`, `/wxpusher` e `/serverchan`,
e usa `Authorization: Bearer <token>` para autenticação; consulte os passos completos em [worker.md](worker.md).

Exemplo de configuração no lado do Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verificação

Depois de concluir a implementação, aceda a:

```text
/healthz
```

Se devolver `status: ok`, significa que o processo do serviço foi iniciado e que o health check não lê Deno KV.