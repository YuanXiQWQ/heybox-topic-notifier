/**
 * @file 本文件是应用入口，负责创建 Hono 应用、挂载路由并启动服务。
 */
import { Hono } from "@hono/hono";
import { createAuthMiddleware, createAuthRoutes } from "./auth.ts";
import { registerCrons } from "./crons.ts";
import { createRoutes } from "./routes.ts";
import { createAppContext } from "./services/app_context.ts";

/**
 * Hono 应用实例。
 */
const app = new Hono();
/**
 * 应用运行时上下文。
 */
const context = createAppContext();

app.route("/", createAuthRoutes(context.storage));
app.use("*", createAuthMiddleware(context.storage));
app.route("/", createRoutes(context));
registerCrons(context);

Deno.serve({ port: context.config.port }, app.fetch);
