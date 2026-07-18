/**
 * @file 本文件负责组装 Hono 应用和应用运行时上下文。
 */
import { Hono } from "@hono/hono";
import { createAuthMiddleware, createAuthRoutes } from "./auth.ts";
import { createRoutes } from "./routes.ts";
import { createAppContext } from "./services/app_context.ts";

/**
 * 创建应用实例和运行时上下文。
 *
 * @return {{ app: Hono; context: ReturnType<typeof createAppContext> }} 应用实例和运行时上下文。
 */
export function createApplication() {
  const app = new Hono();
  const context = createAppContext();
  const authOptions = { defaultLocale: context.config.defaultSettings.locale };

  app.route("/", createAuthRoutes(context.storage, authOptions));
  app.use("*", createAuthMiddleware(context.storage, authOptions));
  app.route("/", createRoutes(context));

  return { app, context };
}
