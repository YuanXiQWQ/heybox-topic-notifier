# Instruções de implantação

Este projeto usa a integração do GitHub do Deno Deploy para implantação e não usa GitHub Actions para implantar o aplicativo. O GitHub Actions apenas executa
`deno task check`; o Deno Deploy fica responsável por compilar e rotear o aplicativo depois de um push no repositório.

## Implantação por branches

O Deno Deploy cria timelines diferentes para o mesmo App:

- `main`: implantação da versão oficial, roteada para a Production URL
- `dev`: implantação de teste antes do lançamento, roteada para a Git Branch / DEV URL

Quando o App atual se chama `heybox-topic-notifier`, a convenção de URL é aproximadamente:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

A implantação de teste atual de `dev` já foi criada, e a entrada estável de teste é a Git Branch / DEV URL. Pushes futuros para `dev`
acionarão a atualização da implantação de teste, enquanto pushes para `main` acionarão a atualização de Production.

A integração do GitHub do Deno Deploy pode criar Git Branch timelines e Builds para pushes em branches de funcionalidades. Para evitar que Preview
e branches comuns de funcionalidades leiam KV, busquem dados do Heybox ou enviem notificações repetidamente, o entrypoint de implantação declara Cron no nível superior, mas o handler só continua a execução quando
`DENO_TIMELINE=production` ou `DENO_TIMELINE=git-branch/dev`. Requisições comuns de página, o caminho raiz,
health checks e requisições Warm up
não acionam polling automático; consultas vencidas da página frontend com menos de um minuto acionam o agendamento da conta atual por meio de uma interface de estado controlada.

## Configuração do Deno Deploy

Mantenha a seguinte configuração no Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

A configuração deploy em `deno.json` é a única fonte de configuração do repositório para o entrypoint de implantação.

## Banco de dados

O Deno Deploy App já está vinculado a um banco de dados Deno KV. O código usa `Deno.openKv()`
para ler e gravar contas, configurações, histórico, estado de polling e marcadores de postagens processadas. As senhas das contas são salvas como hashes PBKDF2 com salt; os dados de usuário são isolados pelo prefixo user
ID, e o Deno Deploy também isola dados de Production e Git Branch por timeline.

## Variáveis de ambiente de execução

Configure no Deno Deploy App conforme necessário. O `.env.example` na raiz do repositório está organizado por cenário: por padrão, apenas a configuração mínima utilizável é ativada,
enquanto outras configurações de ajuste de polling, canais de notificação, retransmissão e allowlist de segurança permanecem comentadas; descomente as linhas correspondentes apenas para o cenário que for usar.

- Valores padrão básicos: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
- Ajuste de polling: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Sobrescrita de requisições do Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Itens comuns de notificação: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notificações Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notificações por e-mail: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Retransmissão de notificações: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Allowlist de segurança de saída: `OUTBOUND_ALLOWED_HOSTS`

A entrega de notificações valida destinos de Webhook personalizado, Email API e SMTP. Por padrão, apenas URLs HTTPS públicas e portas SMTP
comuns são permitidas; se precisar usar uma retransmissão auto-hospedada ou um serviço de e-mail fixo, use `OUTBOUND_ALLOWED_HOSTS` separado por vírgulas
para permitir explicitamente os hosts correspondentes, por exemplo `relay.example.com,smtp.example.com`.
Depois de definir essa variável, o destino de saída da notificação deve corresponder a um host da lista ou a um curinga no formato `*.example.com`.

Redirecionamentos HTTP são validados salto a salto, e apenas redirecionamentos same-origin são permitidos. Quando `OUTBOUND_ALLOWED_HOSTS` não está configurado, os resultados DNS
A/AAAA do host de destino também são validados para garantir que não caiam em faixas de localhost, rede interna, link-local, serviço de metadados ou endereços reservados. `OUTBOUND_ALLOWED_HOSTS`
é um limite de confiança explícito definido pelo administrador; curingas só devem ser configurados sob domínios totalmente controlados.

O aplicativo fornece páginas de registro e login. Informações de conta, sessões de login, além das configurações, registros de correspondência, estado de polling e configuração de notificações de cada conta são armazenados no
Deno KV e isolados por user ID. O cookie do navegador salva apenas um random session token; o servidor salva o hash do token
e o horário de expiração.

A busca real de tópicos do Heybox é atualmente a única fonte de dados em execução. Por padrão, `HEYBOX_SIGNATURE_MODE=app` usa a lista verificada de horários de publicação da App API;
`web` é mantido apenas como fallback de diagnóstico. `POLL_ENABLED`
serve apenas como chave inicial de polling para novas contas ou para a conta padrão; se a busca realmente ocorre depende da opção “Enable polling” na página de configurações de cada conta.

## Retransmissão de notificações

Se o Deno Deploy não puder acessar diretamente PushPlus, WxPusher ou Server酱, você pode primeiro implantar uma retransmissão gratuita com Cloudflare Worker.
O `workers/notification-relay.js` do repositório fornece de forma fixa três entradas de encaminhamento: `/pushplus`, `/wxpusher` e `/serverchan`,
e usa `Authorization: Bearer <token>` para autenticação; veja os passos completos em [worker.md](worker.md).

Exemplo de configuração no lado do Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verificação

Após concluir a implantação, acesse:

```text
/healthz
```

Se retornar `status: ok`, isso significa que o processo do serviço foi iniciado e que o health check não lê Deno KV.