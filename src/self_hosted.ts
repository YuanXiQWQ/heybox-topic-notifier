/** @file 启动 Oracle 等常驻服务器的 Turso 服务，并在退出时等待在途操作结束。 */
import { createApplication } from "./app.ts";
import { registerCrons } from "./crons.ts";
import { createPollingContext } from "./services/polling_context.ts";
import { selfHostedConfig, selfHostedHandler } from "./self_hosted_runtime.ts";

/** 在存储初始化前完成配置检查，避免误启用 KV 或双后台。 */
const config = selfHostedConfig();
/** HTTP 与调度器使用同一个缓存和权威存储。 */
const pollingContext = createPollingContext({ cacheSchedule: true });
await pollingContext.storage.listPollSchedule!();
/** 包含完整网页、同步、认证和通知接口的应用。 */
const { app, context } = createApplication(pollingContext);
/** 验证环境显式关闭调度，防止与生产后台重复轮询。 */
const stopTimer = config.polling ? registerCrons(context) : () => {};
/** 仅允许同机 Caddy 接入的 HTTP 服务。 */
const server = Deno.serve({ hostname: "127.0.0.1", port: config.port }, selfHostedHandler(config.origin, app.fetch));
let stopping = false;

/** 停止接受新操作，并等待 HTTP 写入和后台轮询结束后退出。 */
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  stopTimer();
  await Promise.all([context.scheduler.stop(), server.shutdown()]);
}

/** 将操作系统退出信号委托给可等待的关闭流程。 */
function onSignal(): void {
  void shutdown().catch(() => { console.error("Self-hosted shutdown failed."); Deno.exitCode = 1; });
}

Deno.addSignalListener("SIGTERM", onSignal);
Deno.addSignalListener("SIGINT", onSignal);
await server.finished;
Deno.removeSignalListener("SIGTERM", onSignal);
Deno.removeSignalListener("SIGINT", onSignal);
