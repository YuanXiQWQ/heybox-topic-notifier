# Notificador de temas de Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Español** |
| :-------------------------: | :---------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Añade un tema de Heybox en los ajustes, selecciona palabras clave, expresiones regulares o filtros de IA y activa la consulta periódica. Puedes mover las coincidencias al historial y devolverlas al espacio de trabajo.

Las cuentas nuevas requieren un código de invitación. Las notificaciones de la aplicación se activan por dispositivo y pueden combinarse con correo electrónico o un webhook. Los cambios sin conexión se sincronizan al reconectar. El idioma y el modo oscuro siguen los ajustes del dispositivo de forma predeterminada.

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
- Ajustes → Ajustes de notificaciones → Probar notificación
- Canales de notificación: Webhook personalizado, ServerChan, PushPlus, WxPusher, API de correo
  electrónico y SMTP
- Retransmisión de notificaciones: relay opcional de Cloudflare Worker para PushPlus, WxPusher y
  ServerChan

## Desarrollo local

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Despliegue

El servicio Deno se ejecuta en Oracle Cloud detrás de Caddy. Turso almacena cuentas, sesiones y coincidencias. GitHub Actions genera los instaladores de Windows y Android a partir de las etiquetas de versión.

[Alojamiento propio](./deployment.md) · [Cloudflare Worker](./worker.md)

## Licencia

Este proyecto está licenciado bajo la [GNU Affero General Public License v3.0](../../LICENSE).
