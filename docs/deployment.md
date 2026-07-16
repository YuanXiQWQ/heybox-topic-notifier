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

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/main.ts`
- Config Source: `deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一仓库配置来源。

## 数据库

Deno Deploy App 已绑定 Deno KV 数据库。代码通过 `Deno.openKv()`
读写设置、历史记录、轮询状态和已处理帖子标记；Deno Deploy 会按 timeline 隔离 Production 和 Git
Branch 数据。

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
- `NOTIFIER_PUSHPLUS_SEND_URL`
- `NOTIFIER_WEBHOOK_URL`

真实小黑盒话题抓取是当前唯一运行数据源。默认 `HEYBOX_SIGNATURE_MODE=app` 使用已验证的 App API
发布时间列表；`web` 仅保留为诊断回退。除非正在验证定时轮询，Production 和 Git Branch / DEV
都建议先保持 `POLL_ENABLED=false`。

## 验证

部署完成后访问：

```text
/healthz
```

返回 `status: ok` 即代表服务进程已启动，且健康检查不会读取 Deno KV。
