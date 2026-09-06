/**
 * @file 本文件负责组装 Hono 应用和应用运行时上下文。
 */
import { Hono } from "@hono/hono";
import {
  type AuthOptions,
  createAuthMiddleware,
  createAuthRoutes,
} from "./auth.ts";
import {
  aceAttorneyAssetResponse,
  aceAttorneyScriptResponse,
  aceAttorneyStyleResponse,
  easterEggCoordinatorScriptResponse,
  lobotomyCorpAssetResponse,
  lobotomyCorpScriptResponse,
  lobotomyCorpStyleResponse,
} from "./easter_egg_assets.ts";
import { faviconResponse } from "./favicon.ts";
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
  app.get("/favicon.ico", () => faviconResponse());
  app.get(
    "/static/fun/coordinator.js",
    () => easterEggCoordinatorScriptResponse(),
  );
  app.get(
    "/static/fun/ace-attorney/ace-attorney.js",
    () => aceAttorneyScriptResponse(),
  );
  app.get(
    "/static/fun/ace-attorney/ace-attorney.css",
    () => aceAttorneyStyleResponse(),
  );
  app.get(
    "/static/fun/ace-attorney/assets/*",
    (c) =>
      aceAttorneyAssetResponse(
        c.req.path.slice(
          "/static/fun/ace-attorney/assets/".length,
        ),
        c.req.header("range"),
      ),
  );
  app.get(
    "/static/fun/lobotomy-corp/lobotomy-corp.js",
    () => lobotomyCorpScriptResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/lobotomy-corp.css",
    () => lobotomyCorpStyleResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/Assets/*",
    (c) =>
      lobotomyCorpAssetResponse(
        c.req.path.slice(
          "/static/fun/lobotomy-corp/Assets/".length,
        ),
        c.req.header("range"),
      ),
  );
  app.get("/static/fun/default-avatar/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (!/^avatar[1-5]\.png$/.test(filename)) {
      return new Response(null, { status: 404 });
    }
    const data = await Deno.readFile(
      new URL(`../static/fun/default-avatar/${filename}`, import.meta.url),
    );
    return new Response(data, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/png",
      },
    });
  });
  app.route("/", createAuthRoutes(context.storage, authOptions));
  app.use("*", createAuthMiddleware(context.storage, authOptions));
  app.route("/", createRoutes(context));

  return { app, context };
}
