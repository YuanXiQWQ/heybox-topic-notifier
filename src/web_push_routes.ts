/** @file 为当前登录浏览器提供通知能力查询和受 CSRF 保护的订阅管理。 */
import { Hono } from "@hono/hono";
import { bodyLimit } from "@hono/hono/body-limit";
import {
  defaultSessionCookieName,
  readAuthSession,
  sessionTokenHash,
} from "./auth/session.ts";
import { parseCookies } from "./security/cookies.ts";
import { verifyCsrfToken } from "./security/csrf.ts";
import {
  parseBrowserSubscription,
  webPushConfig,
} from "./services/web_push.ts";
import type { Storage } from "./storage/types.ts";

/**
 * 创建浏览器订阅接口，账号身份始终来自服务端会话。
 * @param {Storage} storage 账号与订阅存储。
 * @return {Hono} 通知接口。
 */
export function createWebPushRoutes(storage: Storage): Hono {
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 8192 }));
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });
  /**
   * 返回浏览器可公开使用的推送密钥与当前账号，不暴露私钥。
   * @param {import("@hono/hono").Context} c 请求上下文。
   * @return {Promise<Response>} 推送配置或未登录响应。
   */
  app.get("/status", async (c) => {
    const session = await readAuthSession(c.req.header("cookie"), storage);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const config = webPushConfig();
    const deviceId = c.req.query("device");
    const token = parseCookies(c.req.header("cookie")).get(
      defaultSessionCookieName,
    )!;
    const sessionHash = await sessionTokenHash(token);
    const enabled = deviceId && storage.webPush
      ? (await storage.webPush.list(session.userId)).some((device) =>
        device.id === deviceId && device.sessionHash === sessionHash
      )
      : false;
    return c.json({
      userId: session.userId,
      enabled,
      publicKey: storage.webPush ? config?.publicKey ?? null : null,
    });
  });
  /**
   * 保存或关闭当前浏览器订阅，订阅与会话绑定以支持退出后停止投递。
   * @param {import("@hono/hono").Context} c 请求上下文。
   * @return {Promise<Response>} 订阅处理结果。
   */
  app.post("/subscription", async (c) => {
    const cookie = c.req.header("cookie");
    const session = await readAuthSession(cookie, storage);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    if (!verifyCsrfToken(cookie, c.req.header("x-csrf-token"))) {
      return c.json({ error: "csrf" }, 403);
    }
    if (!storage.webPush) return c.json({ error: "unavailable" }, 503);
    const limiter = await storage.recordRateLimitHit(
      ["web-push", session.userId],
      30,
      60000,
    );
    if (!limiter.allowed) return c.json({ error: "rateLimited" }, 429);
    let body: { subscription?: unknown; enabled?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    if (!body || typeof body.enabled !== "boolean") {
      return c.json({ error: "invalid" }, 400);
    }
    const subscription = parseBrowserSubscription(body.subscription);
    if (!subscription) return c.json({ error: "invalid" }, 400);
    const id = await sessionTokenHash(subscription.endpoint);
    if (!body.enabled) {
      await storage.webPush.remove(id, session.userId);
      return c.json({ ok: true });
    }
    if (!webPushConfig()) return c.json({ error: "unavailable" }, 503);
    const devices = await storage.webPush.list(session.userId);
    if (devices.length >= 20 && !devices.some((device) => device.id === id)) {
      return c.json({ error: "deviceLimit" }, 409);
    }
    const token = parseCookies(cookie).get(defaultSessionCookieName)!;
    await storage.webPush.save({
      id,
      userId: session.userId,
      subscription,
      sessionHash: await sessionTokenHash(token),
      updatedAt: new Date().toISOString(),
    });
    return c.json({ ok: true });
  });
  return app;
}
