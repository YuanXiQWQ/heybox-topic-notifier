/**
 * @file 本文件是 Deno Deploy 入口，负责声明部署 Cron 并启动 HTTP 服务。
 */
import { createApplication } from "./app.ts";
import { deployCronSchedule, readDenoTimeline, shouldRunDeployCron } from "./crons.ts";

const { app, context } = createApplication();

if (shouldRunDeployCron(readDenoTimeline(), context.config.defaultSettings.polling.enabled)) {
  Deno.cron("poll heybox topics", deployCronSchedule, async () => {
    if (!shouldRunDeployCron(readDenoTimeline(), context.config.defaultSettings.polling.enabled)) {
      return;
    }

    await context.scheduler.tick();
  });
}

Deno.serve({ port: context.config.port }, app.fetch);
