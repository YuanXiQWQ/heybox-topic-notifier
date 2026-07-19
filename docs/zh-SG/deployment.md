# 部署说明

本项目使用 Deno Deploy 的 GitHub 集成部署，不使用 GitHub Actions 部署应用。GitHub Actions 只负责运行
`deno task check`，Deno Deploy 负责在仓库 push 后构建并路由应用。

## 分支部署

Deno Deploy 会为同一个 App 创建不同 timeline：

- `main`：正式发布部署，路由到 Production URL
- `dev`：发布前测试部署，路由到 Git Branch / DEV URL

当前 App 名为 `heybox-topic-notifier` 时，URL 约定为：

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

当前 `dev` 测试部署已经建立，稳定测试入口是 Git Branch / DEV URL。后续推送到 `dev`
会触发测试部署更新，推送到 `main` 会触发 Production 更新。

Deno Deploy 的 GitHub 集成可能会为功能分支 push 创建 Git Branch timeline 和 Build。为了避免 Preview
和普通功能分支重复读取 KV、抓取小黑盒或发送通知，部署入口会在顶层声明 Cron，但 handler 只会在
`DENO_TIMELINE=production` 或 `DENO_TIMELINE=git-branch/dev` 时继续执行。普通页面请求、根路径、
健康检查和 Warm up
请求不会触发自动轮询；前台页面低于一分钟的到点查询会通过受控状态接口触发当前账号调度。

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一仓库配置来源。

## 数据库

Deno Deploy App 已绑定 Deno KV 数据库。代码通过 `Deno.openKv()`
读写账号、设置、历史记录、轮询状态和已处理帖子标记。账号密码以加盐 PBKDF2 哈希保存；用户数据按用户
ID 前缀隔离，Deno Deploy 还会按 timeline 隔离 Production 和 Git Branch 数据。

## 运行环境变量

Deno Deploy App 中按需配置。仓库根目录的 `.env.example` 已按场景整理：默认只启用最小可用配置，
其他轮询调优、通知渠道、中转和安全白名单配置保持注释，使用哪个场景再取消对应行。

- 基础默认值：`APP_LOCALE`、`HEYBOX_TOPIC_ID`、`POLL_ENABLED`、`NOTIFIER_PROVIDER`
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

应用提供注册和登录页面。账号信息、登录会话，以及各账号的设置、命中记录、轮询状态、通知配置都存储在
Deno KV 中，并按用户 ID 隔离。浏览器 Cookie 只保存随机 session token；服务端保存 token
哈希和过期时间。

真实小黑盒话题抓取是当前唯一运行数据源。默认 `HEYBOX_SIGNATURE_MODE=app` 使用已验证的 App API
发布时间列表；`web` 仅保留为诊断回退。`POLL_ENABLED`
只作为新账号或默认账号的初始轮询开关；是否实际抓取，以各账号设置页中的“启用轮询”为准。

## 通知中转

如果 Deno Deploy 不能直接访问 PushPlus、WxPusher 或 Server酱，可以先部署免费的 Cloudflare Worker
中转。仓库中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三个转发入口，并使用 `Authorization: Bearer <token>` 鉴权；完整步骤见 [worker.md](worker.md)。

Deno Deploy 侧配置示例：

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 验证

部署完成后访问：

```text
/healthz
```

返回 `status: ok` 即代表服务进程已启动，且健康检查不会读取 Deno KV。