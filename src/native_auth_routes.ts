/** @file 提供使用系统浏览器完成现有登录和 MFA 的一次性原生会话交接。 */
import { Hono } from "@hono/hono";
import { bodyLimit } from "@hono/hono/body-limit";
import {
  readAuthSession,
  redirectWithSession,
  sessionTokenHash,
} from "./auth/session.ts";
import type { Storage } from "./storage/types.ts";
import {
  csrfHiddenInput,
  csrfTokenForRequest,
  verifyCsrfToken,
  withCsrfCookie,
} from "./security/csrf.ts";
import { getMessages } from "./locales/index.ts";
import { escapeHtml, renderLayout } from "./views/html.ts";
import { clientRateLimitIdentifier } from "./security/rate_limit.ts";

/**
 * 创建原生登录交接接口，随机 verifier 始终留在发起设备。
 * @param {Storage} storage 认证存储。
 * @return {Hono} 原生登录接口。
 */
export function createNativeAuthRoutes(storage: Storage): Hono {
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 4096 }));
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store");
    c.header("referrer-policy", "no-referrer");
    await next();
  });
  /**
   * 创建短时 PKCE 交接，拒绝凭据和任意回调地址。
   * @param {import("@hono/hono").Context} c 请求。
   * @return {Promise<Response>} 不含 verifier 的浏览器入口。
   */
  app.post("/start", async (c) => {
    if (!storage.nativeLogin) return c.json({ error: "unavailable" }, 503);
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "origin" }, 403);
    }
    const limit = await storage.recordRateLimitHit(
      [
        "native-login-start",
        clientRateLimitIdentifier((name) => c.req.header(name)),
      ],
      20,
      60000,
    );
    if (!limit.allowed) return c.json({ error: "rateLimited" }, 429);
    let challenge: unknown;
    try {
      challenge = (await c.req.json()).challenge;
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    if (
      typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    ) return c.json({ error: "invalid" }, 400);
    const id = crypto.randomUUID();
    await storage.nativeLogin.create({
      id,
      challenge,
      expiresAt: Date.now() + 5 * 60000,
    });
    return c.json({ id, path: `/auth/native/approve?id=${id}` });
  });
  /**
   * 使用完整的既有登录流程，再由已登录用户明确确认设备交接。
   * @param {import("@hono/hono").Context} c 请求。
   * @return {Promise<Response>} 当前账号的授权确认页。
   */
  app.get("/approve", async (c) => {
    const id = c.req.query("id") ?? "";
    if (!/^[a-f0-9-]{36}$/.test(id) || !await storage.nativeLogin?.read(id)) {
      return c.text("Expired login request", 410);
    }
    const session = await readAuthSession(c.req.header("cookie"), storage);
    if (!session) {
      return c.redirect(
        `/login?returnTo=${
          encodeURIComponent(`/auth/native/approve?id=${id}`)
        }`,
        303,
      );
    }
    const settings = await storage.forUser(session.userId).getSettings(),
      account = await storage.getAccountById(session.userId);
    const labels = getMessages(settings.locale),
      csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderLayout({
        account,
        csrfToken: csrf.token,
        darkMode: settings.darkMode,
        locale: settings.locale,
        themeColor: settings.themeColor,
        title: labels.nativeLoginTitle,
        body: `<section class="settings-group"><h1>${
          escapeHtml(labels.nativeLoginTitle)
        }</h1><p>${
          escapeHtml(account?.displayName ?? session.username)
        }</p><p><code>${
          escapeHtml(id.slice(0, 8).toUpperCase())
        }</code></p><form method="post">${
          csrfHiddenInput(csrf.token)
        }<input type="hidden" name="id" value="${id}"><button type="submit">${
          escapeHtml(labels.accountAvatarConfirm)
        }</button></form></section>`,
      })),
      csrf,
    );
  });
  /**
   * 将交接绑定到完成网页认证的账号，CSRF 校验阻止跨站代授权。
   * @param {import("@hono/hono").Context} c 请求。
   * @return {Promise<Response>} 授权结果。
   */
  app.post("/approve", async (c) => {
    const session = await readAuthSession(c.req.header("cookie"), storage);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const form = await c.req.parseBody();
    if (!verifyCsrfToken(c.req.header("cookie"), form.csrfToken)) {
      return c.json({ error: "csrf" }, 403);
    }
    if (
      typeof form.id !== "string" ||
      !await storage.nativeLogin?.approve(form.id, session.userId)
    ) return c.text("Expired login request", 410);
    const settings = await storage.forUser(session.userId).getSettings(),
      labels = getMessages(settings.locale);
    return c.html(renderLayout({
      account: await storage.getAccountById(session.userId),
      csrfToken: csrfTokenForRequest(c.req.header("cookie"), c.req.url).token,
      darkMode: settings.darkMode,
      locale: settings.locale,
      themeColor: settings.themeColor,
      title: labels.nativeLoginTitle,
      body: `<section class="settings-group"><h1>${
        escapeHtml(labels.nativeLoginApproved)
      }</h1></section>`,
    }));
  });
  /**
   * 只有持有原始 verifier 的设备才能一次性获取同一账号的 HttpOnly 会话。
   * @param {import("@hono/hono").Context} c 请求。
   * @return {Promise<Response>} 会话 Cookie 或等待授权状态。
   */
  app.post("/exchange", async (c) => {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "origin" }, 403);
    }
    let data: { id?: unknown; verifier?: unknown };
    try {
      data = await c.req.json();
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    if (
      typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id) ||
      typeof data.verifier !== "string" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(data.verifier)
    ) return c.json({ error: "invalid" }, 400);
    const request = await storage.nativeLogin?.read(data.id);
    if (!request || request.consumed) return c.json({ error: "expired" }, 410);
    if (request.challenge !== await sessionTokenHash(data.verifier)) {
      return c.json({ error: "invalidProof" }, 403);
    }
    if (!request.userId) return c.json({ pending: true }, 202);
    const userId = await storage.nativeLogin!.consume(
      data.id,
      request.challenge,
    );
    const account = userId ? await storage.getAccountById(userId) : undefined;
    if (!account) return c.json({ error: "expired" }, 410);
    const response = await redirectWithSession(
      c.req.url,
      "/",
      account,
      storage,
      { sessionMaxAgeSeconds: 30 * 24 * 60 * 60 },
    );
    return new Response(JSON.stringify({ ok: true, userId }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "set-cookie": response.headers.get("set-cookie")!,
      },
    });
  });
  return app;
}
