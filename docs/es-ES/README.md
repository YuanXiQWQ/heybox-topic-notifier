# Notificador de temas de Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Español** |
|:-----------------------:|:-----------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
es una aplicación ligera de Deno para monitorizar publicaciones de temas de Heybox. Lee periódicamente
publicaciones reales de temas según la configuración de cada cuenta, comprueba títulos, cuerpos,
comentarios y respuestas con reglas de palabras clave, registra las coincidencias en las vistas de
pendientes e historial, y envía notificaciones a través del canal configurado.

## Funciones

- Panel: permite ver el estado del sondeo, el total de coincidencias, la coincidencia más reciente y
  las coincidencias pendientes, con una acción de comprobación manual
- Página de configuración: permite configurar ID de temas, estado de activación, notas, unidad del
  intervalo de sondeo, límite de publicaciones, modo de ordenación, idioma de la interfaz, modo oscuro
  y color del tema
- Configuración de cuenta: registro, inicio de sesión, cierre de sesión, actualización del nombre de
  usuario y actualización de contraseña; los datos de cuenta se aíslan por ID de usuario
- Reglas de palabras clave: admite reglas compartidas, reglas específicas de tema, ubicaciones de
  coincidencia, distinción entre mayúsculas y minúsculas, y expresiones regulares
- Tablas de coincidencias: los registros pendientes y del historial admiten filtros por intervalo de
  tiempo, paginación, finalización por lotes y acciones de eliminación
- Entradas de depuración: coincidencias simuladas y pruebas de notificación, con límites de frecuencia
  del lado del servidor para sondeos manuales y operaciones de depuración
- Canales de notificación: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de correo
  electrónico y SMTP
- Retransmisión de notificaciones: relay opcional de Cloudflare Worker para PushPlus, WxPusher y
  ServerChan
- Seguridad: hashes de contraseña PBKDF2, sesiones respaldadas por KV, tokens CSRF, cabeceras de
  seguridad, registros de auditoría y lista de permitidos saliente con validación DNS

## Stack

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + planificador de temporizador local
- HTML renderizado en servidor + JavaScript/CSS nativos
- Script de Cloudflare Workers para retransmisión de notificaciones

## Desarrollo local

Inicia el servidor de desarrollo:

```powershell
deno task dev
```

Después abre:

```text
http://localhost:8000
```

Para sobrescribir los valores predeterminados, usa `.env.example` como referencia y define las variables
de entorno correspondientes en tu entorno de ejecución. Registra una cuenta en la primera visita; las
variables de entorno solo inicializan valores predeterminados para cuentas nuevas o datos predeterminados,
y después la página de configuración de cada cuenta pasa a ser la fuente de verdad.

La aplicación proporciona páginas de registro e inicio de sesión. Cada cuenta tiene configuración,
historial de coincidencias, estado de sondeo y configuración de notificaciones aislados, por lo que los
usuarios que comparten la misma URL de despliegue no comparten datos. Las contraseñas de usuario se
almacenan en Deno KV como hashes PBKDF2 con sal, no como texto plano. Las sesiones de inicio de sesión
se almacenan en Deno KV, y la cookie del navegador solo contiene un token de sesión aleatorio. Las
mutaciones de configuración, cuenta y depuración validan un token CSRF, y las operaciones sensibles
tienen límite de frecuencia en despliegues públicos.

## Comandos

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` borra los marcadores de publicaciones procesadas para que las mismas publicaciones puedan
verificarse de nuevo; úsalo con cuidado en producción.

## Despliegue

Consulta [deployment](./deployment.md) para la configuración de Deno Deploy. El punto de entrada de la
aplicación se define mediante la sección `deploy` de `deno.json`; GitHub Actions solo ejecuta comprobaciones
y no despliega la aplicación. El punto de entrada de despliegue en `src/deploy.ts` declara el Cron de
Deno Deploy, y el sondeo real solo se ejecuta en Production y en la línea temporal de la rama Git `dev`.
Consulta [worker](./worker.md) para configurar el Worker de retransmisión de notificaciones.

## Licencia

Este proyecto está licenciado bajo la [GNU Affero General Public License v3.0](../../LICENSE).