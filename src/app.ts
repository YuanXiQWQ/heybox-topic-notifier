/**
 * @file 本文件负责组装 Hono 应用和应用运行时上下文。
 */
import { Hono } from "@hono/hono";
import {
  type AuthOptions,
  createAuthMiddleware,
  createAuthRoutes,
  readAuthSession,
} from "./auth.ts";
import {
  aceAttorneyAssetResponse,
  aceAttorneyScriptResponse,
  aceAttorneyStyleResponse,
  easterEggCoordinatorScriptResponse,
  lobotomyCorpAssetResponse,
  lobotomyCorpBlackForestEventResponse,
  lobotomyCorpDangerScoreResponse,
  lobotomyCorpDontTouchMeEventResponse,
  lobotomyCorpScriptResponse,
  lobotomyCorpStyleResponse,
  lobotomyCorpWhiteNightEventResponse,
} from "./easter_egg_assets.ts";
import { faviconResponse } from "./favicon.ts";
import { createRoutes } from "./routes.ts";
import { csrfTokenForRequest, withCsrfCookie } from "./security/csrf.ts";
import { createSecurityHeadersMiddleware } from "./security/headers.ts";
import { createAppContext } from "./services/app_context.ts";
import type { PollingContext } from "./services/polling_context.ts";
import { renderNotFound } from "./views/not_found.ts";
import { createWebPushRoutes } from "./web_push_routes.ts";
import { createNativeAuthRoutes } from "./native_auth_routes.ts";

/**
 * 创建应用实例和运行时上下文。
 *
 * @param {PollingContext} pollingContext 可选的共享轮询上下文。
 * @return {object} 应用实例和运行时上下文。
 */
export function createApplication(pollingContext?: PollingContext) {
  const app = new Hono();
  const context = createAppContext(pollingContext);
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
    altcha: context.config.altcha,
    totp: context.config.totp,
    turnstile: context.config.turnstile,
  };

  app.use("*", createSecurityHeadersMiddleware());
  /** @return {Promise<Response>} 应用页面在认证前可加载的兼容脚本。 */
  app.get("/static/app-compat.js", async () => new Response(
    await Deno.readTextFile(new URL("../static/app-compat.js", import.meta.url)),
    { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } },
  ));
  /**
   * 公开提供无用户数据的离线存储脚本，供 Service Worker 启动时加载。
   * @return {Promise<Response>} 同源脚本。
   */
  app.get("/static/app-sync/store.js", async () => new Response(await Deno.readTextFile(new URL("../static/app-sync/store.js", import.meta.url)), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } }));
  /**
   * 向浏览器提供可在登录会话外启动的通知 Service Worker。
   * @return {Promise<Response>} 禁止长期缓存的脚本。
   */
  app.get("/app-sw.js", async () => new Response(
    await Deno.readTextFile(new URL("../static/app-sw.js", import.meta.url)),
    { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/" } },
  ));
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
    "/static/fun/ace-attorney/*",
    (c) =>
      aceAttorneyAssetResponse(
        c.req.path.slice(
          "/static/fun/ace-attorney/".length,
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
    "/static/fun/lobotomy-corp/Events/WhiteNight.js",
    () => lobotomyCorpWhiteNightEventResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/Events/DangerScore.js",
    () => lobotomyCorpDangerScoreResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/Events/DontTouchMe.js",
    () => lobotomyCorpDontTouchMeEventResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/Events/BlackForest.js",
    () => lobotomyCorpBlackForestEventResponse(),
  );
  app.get(
    "/static/fun/lobotomy-corp/*",
    (c) =>
      lobotomyCorpAssetResponse(
        c.req.path.slice(
          "/static/fun/lobotomy-corp/".length,
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
  app.route("/auth/native", createNativeAuthRoutes(context.storage));
  /**
   * 登录页原生入口脚本不包含账号内容，可在认证前读取。
   * @return {Promise<Response>} 同源登录桥脚本。
   */
  app.get("/static/app-native-auth.js", async () => new Response(await Deno.readTextFile(new URL("../static/app-native-auth.js", import.meta.url)), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } }));
  app.route("/", createAuthRoutes(context.storage, authOptions));
  app.use("*", createAuthMiddleware(context.storage, authOptions));
  /**
   * 将 HTML 响应的账号标识提供给离线缓存，避免跨账号复用页面。
   * @param {import("@hono/hono").Context} c 请求上下文。
   * @param {() => Promise<void>} next 下一个处理器。
   */
  app.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("content-type")?.includes("text/html")) {
      const session = await readAuthSession(c.req.header("cookie"), context.storage);
      if (session) c.header("x-app-user", session.userId);
    }
  });
  app.route("/api/app-notifications", createWebPushRoutes(context.storage));
  app.route("/", createRoutes(context));

  // 未匹配任何路由时给出与普通页面同风格的 404。认证中间件在此之前已把未登录
  // 访客重定向到登录页，因此这里渲染的是已登录用户访问失效地址的场景。
  app.notFound(async (c) => {
    const session = await readAuthSession(
      c.req.header("cookie"),
      context.storage,
      authOptions,
    );
    const account = session
      ? await context.storage.getAccountById(session.userId)
      : undefined;
    const settings = await context.storage.getSettings();
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(
        renderNotFound({
          account,
          csrfToken: csrf.token,
          loginSession: session?.createdAt,
          settings,
        }),
        404,
      ),
      csrf,
    );
  });

  return { app, context };
}
