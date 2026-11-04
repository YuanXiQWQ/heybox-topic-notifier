# Instruções de implementação

O serviço Deno corre na Oracle Cloud com HTTPS fornecido pelo Caddy. O Turso guarda contas, sessões e resultados. O GitHub Actions gera os instaladores para Windows e Android a partir das etiquetas de versão.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Variáveis de ambiente de execução

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Use uma base de dados separada para os testes. Depois de parar as consultas periódicas no servidor anterior, defina `VM_POLLING_ENABLED=true` em produção e reinicie o serviço.

- Valores predefinidos básicos: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
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

A obtenção real de tópicos do Heybox é atualmente a única fonte de dados em execução. Por predefinição, `HEYBOX_SIGNATURE_MODE=app` usa a lista verificada de horas de publicação da App API;
`web` é mantido apenas como fallback de diagnóstico.
As contas novas começam com o polling desativado e só obtêm dados depois de ativar “Enable polling” na sua página de definições.

## Retransmissão de notificações

Se o Oracle Cloud não conseguir aceder diretamente a PushPlus, WxPusher ou Server酱, pode primeiro implementar uma retransmissão gratuita com Cloudflare Worker.
O `workers/notification-relay.js` do repositório fornece de forma fixa três entradas de encaminhamento: `/pushplus`, `/wxpusher` e `/serverchan`,
e usa `Authorization: Bearer <token>` para autenticação; consulte os passos completos em [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verificação

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
