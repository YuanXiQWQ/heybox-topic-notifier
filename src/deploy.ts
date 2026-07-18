/**
 * @file 本文件是 Deno Deploy 入口，负责声明部署 Cron 并启动 HTTP 服务。
 */
import { createApplication } from "./app.ts";
import { deployCronSchedule, readDenoTimeline, shouldRunDeployCron } from "./crons.ts";

const { app, context } = createApplication();

Deno.cron("poll heybox topics", deployCronSchedule, async () => {
  if (!shouldRunDeployCron(readDenoTimeline())) {
    return;
  }

  await context.scheduler.tick();
}).catch((error) => {
  console.error("Deno Deploy Cron 注册失败。", error);
});

Deno.serve({ port: context.config.port }, app.fetch);
