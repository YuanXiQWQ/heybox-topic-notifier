# Worker de retransmissão de notificações

`notification-relay.js` é uma retransmissão leve para Cloudflare Workers e fornece apenas:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API oficial do Server酱
- `GET /healthz` health check

Não aceita URL de destino arbitrários, pelo que não pode ser usado como proxy aberto. A entrada Server酱 aceita apenas um
SendKey seguro e constrói o endereço oficial de acordo com as regras existentes do projeto.

## Passos de implementação

1. Crie um Worker gratuito no Cloudflare Workers.
2. Cole o conteúdo de `workers/notification-relay.js` no editor do Worker, ou implemente o script com Wrangler.
3. Adicione `RELAY_TOKEN` às variáveis/segredos do Worker, usando uma chave aleatória longa como valor.
4. Depois da implementação, aceda a `https://<your-worker>.workers.dev/healthz` e confirme que devolve `{"status":"ok"}`.
5. Configure o Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

O lado do projeto só enviará o seguinte quando o endereço de envio de PushPlus, WxPusher ou Server酱 for alterado para o endereço de retransmissão:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

A retransmissão Server酱 também passa o SendKey através de um header de pedido dedicado:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Teste na consola

Pode primeiro testar se a autenticação está a funcionar na consola do Worker ou com curl local:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Teste do WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Teste do Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```