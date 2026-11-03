# Instrucciones de despliegue

El servicio Deno se ejecuta en Oracle Cloud detrás de Caddy. Turso almacena cuentas, sesiones y coincidencias. GitHub Actions genera los instaladores de Windows y Android a partir de las etiquetas de versión.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## Variables de entorno de ejecución

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

Usa una base de datos independiente para las pruebas. Una vez detenidas las consultas del servidor anterior, configura `VM_POLLING_ENABLED=true` en producción y reinicia el servicio.

- Valores predeterminados básicos: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
- Optimización de sondeo: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Sobrescritura de solicitudes de Heybox: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- Opciones comunes de notificación: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Notificaciones Webhook: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- Notificaciones por correo: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- Retransmisión de notificaciones: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- Lista de permitidos de seguridad saliente: `OUTBOUND_ALLOWED_HOSTS`

La entrega de notificaciones valida los destinos de Webhook personalizado, Email API y SMTP. Por defecto, solo se permiten URL HTTPS públicas y puertos SMTP
comunes; si necesitas usar una retransmisión autohospedada o un servicio de correo fijo, puedes usar `OUTBOUND_ALLOWED_HOSTS` separado por comas
para permitir explícitamente los hosts correspondientes, por ejemplo `relay.example.com,smtp.example.com`.
Después de establecer esta variable, el destino saliente de notificación debe coincidir con un host de la lista o con un comodín de la forma `*.example.com`.

Las redirecciones HTTP se validan salto a salto, y solo se permiten redirecciones del mismo origen. Cuando `OUTBOUND_ALLOWED_HOSTS` no está configurado, también se valida que los resultados DNS
A/AAAA del host de destino no caigan dentro de rangos localhost, red privada, link-local, servicio de metadatos o direcciones reservadas. `OUTBOUND_ALLOWED_HOSTS`
es un límite de confianza explícito del administrador; los comodines solo deben configurarse bajo dominios que se controlen por completo.

La obtención real de temas de Heybox es actualmente la única fuente de datos en ejecución. Por defecto, `HEYBOX_SIGNATURE_MODE=app` usa la lista de publicaciones de App API verificada;
`web` solo se conserva como fallback de diagnóstico.
Las cuentas nuevas empiezan con el sondeo desactivado y solo obtienen datos después de activar “habilitar sondeo” en su página de ajustes.

## Retransmisión de notificaciones

Si Oracle Cloud no puede acceder directamente a PushPlus, WxPusher o Server酱, puedes desplegar primero una retransmisión gratuita con Cloudflare Worker.
El archivo `workers/notification-relay.js` del repositorio proporciona de forma fija las tres entradas de reenvío `/pushplus`, `/wxpusher` y `/serverchan`,
y usa `Authorization: Bearer <token>` para autenticación; los pasos completos están en [worker.md](worker.md).

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verificación

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
