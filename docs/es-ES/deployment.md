# Instrucciones de despliegue

Este proyecto se despliega mediante la integración de GitHub de Deno Deploy, y no usa GitHub Actions para desplegar la aplicación. GitHub Actions solo se encarga de ejecutar
`deno task check`; Deno Deploy se encarga de compilar y enrutar la aplicación después de un push al repositorio.

## Despliegue por ramas

Deno Deploy crea diferentes timelines para la misma App:

- `main`: despliegue de versión oficial, enrutado a la Production URL
- `dev`: despliegue de prueba previo al lanzamiento, enrutado a la Git Branch / DEV URL

Cuando la App actual se llama `heybox-topic-notifier`, la convención de URL es aproximadamente:

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

El despliegue de prueba actual de `dev` ya está creado, y la entrada estable de pruebas es la Git Branch / DEV URL. Los siguientes push a `dev`
activarán la actualización del despliegue de prueba, y los push a `main` activarán la actualización de Production.

La integración de GitHub de Deno Deploy puede crear Git Branch timelines y Builds para push de ramas de funcionalidad. Para evitar que Preview
y las ramas de funcionalidad normales lean KV, obtengan datos de Heybox o envíen notificaciones repetidamente, el punto de entrada de despliegue declara Cron en el nivel superior, pero el handler solo continuará ejecutándose cuando
`DENO_TIMELINE=production` o `DENO_TIMELINE=git-branch/dev`. Las solicitudes normales de página, la ruta raíz,
las comprobaciones de salud y las solicitudes Warm up
no activarán el sondeo automático; las consultas vencidas de la página frontal con menos de un minuto activarán la programación de la cuenta actual mediante una interfaz de estado controlada.

## Configuración de Deno Deploy

Mantén la siguiente configuración en la Deno Deploy App:

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

La configuración `deploy` de `deno.json` es la única fuente de configuración del repositorio para el punto de entrada de despliegue.

## Base de datos

La Deno Deploy App ya tiene vinculada una base de datos Deno KV. El código usa `Deno.openKv()`
para leer y escribir cuentas, ajustes, historial, estado de sondeo y marcadores de publicaciones procesadas. Las contraseñas de cuenta se guardan como hashes PBKDF2 con sal; los datos de usuario se aíslan por prefijo de user
ID, y Deno Deploy también aísla los datos de Production y Git Branch por timeline.

## Variables de entorno de ejecución

Configúralas en la Deno Deploy App según sea necesario. El archivo `.env.example` de la raíz del repositorio está organizado por escenarios: por defecto solo activa la configuración mínima utilizable,
mientras que otros ajustes de optimización de sondeo, canales de notificación, retransmisión y lista de permitidos de seguridad permanecen comentados. Descomenta las líneas correspondientes según el escenario que uses.

- Valores predeterminados básicos: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
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

La aplicación proporciona páginas de registro e inicio de sesión. La información de cuenta, las sesiones de inicio de sesión, así como los ajustes, registros de coincidencias, estado de sondeo y configuración de notificaciones de cada cuenta se almacenan en
Deno KV y se aíslan por user ID. La cookie del navegador solo guarda un token de sesión aleatorio; el servidor guarda el hash del token
y la hora de caducidad.

La obtención real de temas de Heybox es actualmente la única fuente de datos en ejecución. Por defecto, `HEYBOX_SIGNATURE_MODE=app` usa la lista de publicaciones de App API verificada;
`web` solo se conserva como fallback de diagnóstico. `POLL_ENABLED`
solo sirve como interruptor inicial de sondeo para cuentas nuevas o la cuenta predeterminada; si realmente se obtienen datos depende de la opción “habilitar sondeo” en la página de ajustes de cada cuenta.

## Retransmisión de notificaciones

Si Deno Deploy no puede acceder directamente a PushPlus, WxPusher o Server酱, puedes desplegar primero una retransmisión gratuita con Cloudflare Worker.
El archivo `workers/notification-relay.js` del repositorio proporciona de forma fija las tres entradas de reenvío `/pushplus`, `/wxpusher` y `/serverchan`,
y usa `Authorization: Bearer <token>` para autenticación; los pasos completos están en [worker.md](worker.md).

Ejemplo de configuración en Deno Deploy:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## Verificación

Después de completar el despliegue, visita:

```text
/healthz
```

Si devuelve `status: ok`, significa que el proceso del servicio se ha iniciado, y la comprobación de salud no lee Deno KV.