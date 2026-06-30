# 部署说明

本项目使用 `dev` 和 `main` 两条部署分支：

- `dev`：发布前测试部署，推送后部署到测试 Deno Deploy 项目。
- `main`：正式发布部署，推送后部署到正式 Deno Deploy 项目。

## GitHub Secrets

在仓库的 GitHub Actions secrets 中配置：

- `DENO_DEPLOY_TOKEN`：Deno Deploy access token。
- `DENO_DEPLOY_PROJECT_DEV`：`dev` 分支使用的测试项目名。
- `DENO_DEPLOY_PROJECT_MAIN`：`main` 分支使用的正式项目名。

## 流程

`.github/workflows/deploy.yml` 会在 `dev` 和 `main` 有 push 时运行，也支持手动触发。

流程顺序：

1. 安装 Deno 2。
2. 执行 `deno task check`。
3. 使用 `deployctl` 部署 `src/main.ts`。

部署完成后可以访问：

```text
/healthz
```

返回 `status: ok` 即代表服务进程已启动，且健康检查不会读取 Deno KV。

## 运行环境变量

Deno Deploy 项目中按需配置：

- `APP_LOCALE`
- `HEYBOX_TOPIC_ID`
- `POLL_ENABLED`
- `NOTIFIER_PROVIDER`
- `NOTIFIER_WEBHOOK_URL`

当前真实小黑盒数据抓取和正式通知发送还没有接入。除非正在验证定时轮询，测试和正式项目建议先保持 `POLL_ENABLED=false`。
