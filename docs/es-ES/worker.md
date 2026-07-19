# Worker de retransmisión de notificaciones

`notification-relay.js` es una retransmisión ligera para Cloudflare Workers que solo proporciona:

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `POST /serverchan` -> API oficial de Server酱
- `GET /healthz` comprobación de salud

No acepta URL de destino arbitrarias, por lo que no puede usarse como proxy abierto. La entrada de Server酱 solo acepta un
SendKey seguro y construye la dirección oficial según las reglas existentes del proyecto.

## Pasos de despliegue

1. Crea un Worker gratuito en Cloudflare Workers.
2. Pega el contenido de `workers/notification-relay.js` en el editor del Worker, o despliega el script con Wrangler.
3. Añade `RELAY_TOKEN` en las variables/secretos del Worker, usando como valor una clave aleatoria larga.
4. Después del despliegue, visita `https://<your-worker>.workers.dev/healthz` y confirma que devuelve `{"status":"ok"}`.
5. Configura Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

El lado del proyecto solo enviará lo siguiente cuando la dirección de envío de PushPlus, WxPusher o Server酱 se haya cambiado a la dirección de retransmisión:

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

La retransmisión de Server酱 también pasará el SendKey mediante una cabecera de solicitud dedicada:

```http
X-ServerChan-Send-Key: <serverchan-send-key>
```

## Prueba en consola

Puedes probar primero en la consola del Worker o con curl local si la autenticación funciona:

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

Prueba de WxPusher:

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```

Prueba de Server酱:

```bash
curl -i "https://<your-worker>.workers.dev/serverchan" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "X-ServerChan-Send-Key: <serverchan-send-key>" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
```