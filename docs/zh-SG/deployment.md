# 部署说明

正式站运行在 Oracle Cloud 虚拟机上。Caddy 提供 HTTPS，Deno 常驻进程负责抓帖和通知，Turso 保存账号、会话和业务记录。正式标签触发 GitHub Actions 构建 Windows 安装包和 Android APK。

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## 运行环境变量

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

候选实例使用独立数据库。旧轮询停止后，在正式实例设置 `VM_POLLING_ENABLED=true`，并重启服务。

- 基础默认值：`APP_LOCALE`、`HEYBOX_TOPIC_ID`、`NOTIFIER_PROVIDER`
- 轮询调优：`POLL_INTERVAL_MINUTES`、`POLL_POST_LIMIT`、`POLL_SORT`
- 小黑盒请求覆盖：`HEYBOX_SIGNATURE_MODE`、`HEYBOX_DEVICE_ID`、`HEYBOX_COOKIE`、 `HEYBOX_USER_AGENT`
- 通知公共项：`NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook 通知：`NOTIFIER_WEBHOOK_SERVICE`、`NOTIFIER_WEBHOOK_URL`、
  `NOTIFIER_PUSHPLUS_TOKEN`、`NOTIFIER_WXPUSHER_SPT`、`NOTIFIER_SERVER_CHAN_SEND_KEY`
- 邮件通知：`NOTIFIER_EMAIL_SERVICE`、`NOTIFIER_EMAIL_ADDRESS`、`NOTIFIER_EMAIL_FROM`、
  `NOTIFIER_EMAIL_API_URL`、`NOTIFIER_EMAIL_API_TOKEN`、`NOTIFIER_SMTP_HOST`、
  `NOTIFIER_SMTP_PORT`、`NOTIFIER_SMTP_SECURE`、`NOTIFIER_SMTP_USERNAME`、 `NOTIFIER_SMTP_PASSWORD`
- 通知中转：`NOTIFIER_PUSHPLUS_SEND_URL`、`NOTIFIER_WXPUSHER_SEND_URL`、
  `NOTIFIER_SERVER_CHAN_SEND_URL`、`NOTIFIER_RELAY_TOKEN`
- 出站安全白名单：`OUTBOUND_ALLOWED_HOSTS`

通知投递会校验自定义 Webhook、Email API 和 SMTP 目标。默认只允许公网 HTTPS URL 和常见 SMTP
端口；如果需要使用自托管中转或固定邮件服务，可以用逗号分隔的 `OUTBOUND_ALLOWED_HOSTS`
明确允许对应主机，例如 `relay.example.com,smtp.example.com`。
设置该变量后，通知出站目标必须命中列表中的主机或 `*.example.com` 形式的通配符。

HTTP 重定向会逐跳校验，且只允许同源跳转；未配置 `OUTBOUND_ALLOWED_HOSTS` 时，还会校验目标主机的 DNS
A/AAAA 解析结果不落入本机、内网、链路本地、元数据服务或保留地址范围。`OUTBOUND_ALLOWED_HOSTS`
是管理员显式信任边界，通配符只应配置在完全控制的域名下。

真实小黑盒话题抓取是当前唯一运行数据源。默认 `HEYBOX_SIGNATURE_MODE=app` 使用已验证的 App API
发布时间列表；`web` 仅保留为诊断回退。新账号默认关闭轮询，
只有账号在设置页开启“启用轮询”后才会实际抓取。

## 通知中转

如果 Oracle Cloud 不能直接访问 PushPlus、WxPusher 或 Server酱，可以先部署免费的 Cloudflare Worker
中转。仓库中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三个转发入口，并使用 `Authorization: Bearer <token>` 鉴权；完整步骤见 [worker.md](worker.md)。

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 验证

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
