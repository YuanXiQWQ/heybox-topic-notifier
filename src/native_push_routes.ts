/** @file 登记与当前账号及会话绑定的荣耀设备，网页无法选择其它用户。 */
import { Hono } from "@hono/hono";
import { bodyLimit } from "@hono/hono/body-limit";
import { readAuthSession, sessionTokenHash } from "./auth/session.ts";
import { parseCookies } from "./security/cookies.ts";
import { verifyCsrfToken } from "./security/csrf.ts";
import { honorPushConfig } from "./services/honor_push.ts";
import type { Storage } from "./storage/types.ts";

/**
 * 创建受会话和 CSRF 保护的厂商设备接口。
 * @param {Storage} storage 权威存储。
 * @return {Hono} 原生推送路由。
 */
export function createNativePushRoutes(storage: Storage): Hono {
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 8192 }));
  /** 禁止缓存包含当前应用接入状态的响应。 */
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });
  /** 仅向已认证用户提供公开应用 ID，不返回服务端凭据。 */
  app.get("/status", async (c) => {
    if (!await readAuthSession(c.req.header("cookie"), storage)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const config = honorPushConfig();
    return c.json({
      configured: Boolean(config),
      appId: config?.appId ?? null,
    });
  });
  /** 校验当前会话、CSRF 和配置后换绑设备，关闭操作只删除当前绑定。 */
  app.post("/device", async (c) => {
    const cookie = c.req.header("cookie"),
      session = await readAuthSession(cookie, storage);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    if (!verifyCsrfToken(cookie, c.req.header("x-csrf-token"))) {
      return c.json({ error: "csrf" }, 403);
    }
    if (!storage.nativePush) return c.json({ error: "unavailable" }, 503);
    const limit = await storage.recordRateLimitHit(
      ["native-push", session.userId],
      30,
      60000,
    );
    if (!limit.allowed) return c.json({ error: "rateLimited" }, 429);
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    if (
      !body || typeof body !== "object" || typeof body.token !== "string" ||
      body.token.length < 16 ||
      body.token.length > 4096 || /\s/.test(body.token) ||
      [...body.token].some((char: string) => char.charCodeAt(0) < 32) ||
      typeof body.enabled !== "boolean"
    ) return c.json({ error: "invalid" }, 400);
    const id = await sessionTokenHash(`honor:${body.token}`);
    const sessionHash = await sessionTokenHash(
      parseCookies(cookie).get("heybox_session")!,
    );
    if (body.enabled) {
      const config = honorPushConfig();
      if (!config || body.appId !== config.appId) {
        return c.json({ error: "unconfigured" }, 503);
      }
      await storage.nativePush.save({
        id,
        userId: session.userId,
        sessionHash,
        token: body.token,
        provider: "honor",
        updatedAt: new Date().toISOString(),
      });
    } else await storage.nativePush.remove(id, session.userId, sessionHash);
    return c.json({ ok: true });
  });
  return app;
}
