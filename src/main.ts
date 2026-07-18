/**
 * @file 本文件是本地运行入口，负责启动 HTTP 服务和本地轮询定时器。
 */
import { createApplication } from "./app.ts";
import { registerCrons } from "./crons.ts";

const { app, context } = createApplication();
registerCrons(context);

Deno.serve({ port: context.config.port }, app.fetch);
