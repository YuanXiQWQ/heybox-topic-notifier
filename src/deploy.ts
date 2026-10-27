/**
 * @file 本文件是 Deno Deploy 入口，负责声明部署 Cron 并启动 HTTP 服务。
 */
import { createDeployRuntime } from "./deploy_runtime.ts";
import {
  deployCronSchedule,
  readDenoTimeline,
  shouldRunDeployCron,
} from "./crons.ts";

/** 定时任务与 HTTP 请求共用的按需加载运行时。 */
const runtime = createDeployRuntime();

Deno.cron("poll heybox topics", deployCronSchedule, async () => {
  if (!shouldRunDeployCron(readDenoTimeline())) {
    return;
  }

  await runtime.tick();
}).catch((error) => {
  console.error("Deno Deploy Cron 注册失败。", error);
});

Deno.serve({ port: Number(Deno.env.get("PORT") ?? "8000") }, runtime.fetch);
