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

Deno Deploy 的 GitHub 集成可能会为功能分支 push 创建 Git Branch timeline 和 Build。为了避免功能分支
重复读取 KV、抓取小黑盒或发送通知，代码只会在 `production` 和 `git-branch/dev` 这两个
`DENO_TIMELINE` 上注册并执行定时轮询；其他 timeline 不注册 Cron。

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/main.ts`
- Config Source: `deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一仓库配置来源。

## 数据库

Deno Deploy App 已绑定 Deno KV 数据库。代码通过 `Deno.openKv()`
读写账号、设置、历史记录、轮询状态和已处理帖子标记。账号密码以加盐 PBKDF2 哈希保存； 用户数据按用户
ID 前缀隔离，Deno Deploy 还会按 timeline 隔离 Production 和 Git Branch 数据。

## 运行环境变量

Deno Deploy App 中按需配置：

- `APP_LOCALE`
- `HEYBOX_TOPIC_ID`
- `HEYBOX_DEVICE_ID`
- `HEYBOX_COOKIE`
- `HEYBOX_USER_AGENT`
- `HEYBOX_SIGNATURE_MODE`
- `HEYBOX_POST_LIMIT`
- `HEYBOX_SORT_FILTER`
- `POLL_ENABLED`
- `POLL_INTERVAL_MINUTES`
- `POLL_POST_LIMIT`
- `POLL_SORT`
- `NOTIFIER_PROVIDER`
- `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- `NOTIFIER_RELAY_TOKEN`
- `NOTIFIER_PUSHPLUS_SEND_URL`
- `NOTIFIER_WXPUSHER_SEND_URL`
- `NOTIFIER_SERVER_CHAN_SEND_URL`
- `NOTIFIER_WEBHOOK_URL`

应用提供注册和登录页面。账号信息、登录会话，以及各账号的设置、命中记录、轮询状态、通知配置都存储在
Deno KV 中，并按用户 ID 隔离。浏览器 Cookie 只保存随机 session token；服务端保存 token
哈希和过期时间。

真实小黑盒话题抓取是当前唯一运行数据源。默认 `HEYBOX_SIGNATURE_MODE=app` 使用已验证的 App API
发布时间列表；`web` 仅保留为诊断回退。除非正在验证定时轮询，Production 和 Git Branch / DEV
都建议先保持 `POLL_ENABLED=false`。

## 通知中转

如果 Deno Deploy 不能直接访问 PushPlus、WxPusher 或 Server酱，可以先部署免费的 Cloudflare Worker
中转。仓库中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三个转发入口，并使用 `Authorization: Bearer <token>` 鉴权；完整步骤见
[workers/README.md](../workers/README.md)。

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
