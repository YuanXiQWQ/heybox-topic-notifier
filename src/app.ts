/**
 * @file 本文件负责组装 Hono 应用和应用运行时上下文。
 */
import { Hono } from "@hono/hono";
import {
  type AuthOptions,
  createAuthMiddleware,
  createAuthRoutes,
} from "./auth.ts";
import { createRoutes } from "./routes.ts";
import { createSecurityHeadersMiddleware } from "./security/headers.ts";
import { createAppContext } from "./services/app_context.ts";

/**
 * 创建应用实例和运行时上下文。
 *
 * @return 应用实例和运行时上下文。
 */
export function createApplication() {
  const app = new Hono();
  const context = createAppContext();
  const authOptions: AuthOptions = {
    defaultLocale: context.config.defaultSettings.locale,
    emailVerification: context.config.emailVerification,
    sendEmailVerificationEmail: async (message) => {
      await context.notifier.sendEmailMessage(
        message,
        context.config.defaultSettings,
      );
    },
    google: context.config.google,
    passkey: context.config.passkey,
    totp: context.config.totp,
    turnstile: context.config.turnstile,
  };

  app.use("*", createSecurityHeadersMiddleware());
  app.route("/", createAuthRoutes(context.storage, authOptions));
  app.use("*", createAuthMiddleware(context.storage, authOptions));
  app.route("/", createRoutes(context));

  return { app, context };
}
