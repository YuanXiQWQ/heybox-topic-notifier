# 部署说明

本项目使用 Deno Deploy 的 GitHub 集成部署，不使用 GitHub Actions 部署。

GitHub Actions 负责运行 `deno task check`，并在检查通过后创建 GitHub Deployments 引用链接。 Deno
Deploy 负责在仓库 push 后构建并路由应用。

## 分支部署

Deno Deploy 会为同一个 App 创建不同 timeline：

- `main`：正式发布部署，路由到 Production URL。
- `dev`：发布前测试部署，路由到 Git Branch / DEV URL。

当前 App 名为 `heybox-topic-notifier` 时，URL 约定为：

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

当前 `dev` 测试部署已经建立，稳定测试入口是 Git Branch / DEV URL。后续推送到 `dev`
会触发测试部署更新；推送到 `main` 会触发 Production 更新。

## Deno Deploy 配置

在 Deno Deploy App 中保持以下配置：

- Repository：`YuanXiQWQ/heybox-topic-notifier`
- App Directory：root directory
- Entrypoint：`./src/main.ts`
- Config Source：`deno.json deploy section`

`deno.json` 中的 deploy 配置是部署入口的唯一仓库配置来源。

## 数据库

Deno Deploy App 已绑定 Deno KV 数据库。代码通过 `Deno.openKv()`
读写设置、历史记录、轮询状态和已处理帖子标记；Deno Deploy 会按 timeline 隔离 Production 和 Git
Branch 数据。

## 验证

部署完成后访问：

```text
/healthz
```

返回 `status: ok` 即代表服务进程已启动，且健康检查不会读取 Deno KV。

## GitHub Deployments

GitHub 仓库右侧的 Deployments 区块由 `.github/workflows/check.yml` 创建引用记录：

- `main` push 检查通过后，创建 `production` deployment，链接到 Production URL。
- `dev` push 检查通过后，创建 `staging` deployment，链接到 Git Branch / DEV URL。

这些记录只用于从 GitHub 跳转到 Deno 部署；实际部署仍由 Deno Deploy GitHub 集成完成。

## 运行环境变量

Deno Deploy App 中按需配置：

- `APP_LOCALE`
- `HEYBOX_TOPIC_ID`
- `TOPIC_SOURCE`
- `TOPIC_WORKER_URL`
- `TOPIC_WORKER_TOKEN`
- `HEYBOX_DEVICE_ID`
- `HEYBOX_COOKIE`
- `HEYBOX_USER_AGENT`
- `HEYBOX_POST_LIMIT`
- `HEYBOX_SORT_FILTER`
- `POLL_ENABLED`
- `NOTIFIER_PROVIDER`
- `NOTIFIER_WEBHOOK_URL`

真实小黑盒话题抓取可通过 `TOPIC_SOURCE=heybox` 启用。除非正在验证定时轮询，Production 和 Git Branch
/ DEV 都建议先保持 `POLL_ENABLED=false`。
