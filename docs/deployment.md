# 部署说明

本项目使用 Deno Deploy 的 GitHub 集成部署，不使用 GitHub Actions 部署。

GitHub Actions 只负责运行 `deno task check`。Deno Deploy 负责在仓库 push 后构建并路由应用。

## 分支部署

Deno Deploy 会为同一个 App 创建不同 timeline：

- `main`：正式发布部署，路由到 Production URL。
- `dev`：发布前测试部署，路由到 Git Branch / DEV URL。

当前 App 名为 `heybox-topic-notifier` 时，URL 约定为：

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

`dev` 的测试 URL 只有在 Deno Deploy 构建过 `dev` 分支后才会出现。创建 App 时如果只构建了
`main`，Deno Deploy 页面里暂时只会看到 Production 和 Git Branch / MAIN。

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository：`YuanXiQWQ/heybox-topic-notifier`
- App Directory：root directory
- Entrypoint：`./src/main.ts`
- Config Source：`deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一仓库配置来源。

## 验证

部署完成后访问：

```text
/healthz
```

返回 `status: ok` 即代表服务进程已启动，且健康检查不会读取 Deno KV。

## 运行环境变量

Deno Deploy App 中按需配置：

- `APP_LOCALE`
- `HEYBOX_TOPIC_ID`
- `POLL_ENABLED`
- `NOTIFIER_PROVIDER`
- `NOTIFIER_WEBHOOK_URL`

当前真实小黑盒数据抓取和正式通知发送还没有接入。除非正在验证定时轮询，Production 和 Git Branch / DEV
都建议先保持 `POLL_ENABLED=false`。
