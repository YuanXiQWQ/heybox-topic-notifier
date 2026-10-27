/** @file 验证荣耀设备接口的认证、CSRF、输入边界和配置状态。 */
import { assertEquals } from "@std/assert";
import { createNativePushRoutes } from "./native_push_routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { sessionTokenHash } from "./auth/session.ts";
import { csrfTokenForRequest } from "./security/csrf.ts";

Deno.test("native push registration requires current account, CSRF and matching application configuration", async () => {
  const kv = await Deno.openKv(":memory:");
  const names = [
    "HONOR_PUSH_APP_ID",
    "HONOR_PUSH_CLIENT_ID",
    "HONOR_PUSH_CLIENT_SECRET",
  ];
  const previous = names.map((name) => Deno.env.get(name));
  try {
    names.forEach((name) => Deno.env.delete(name));
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {
      openKv: () => Promise.resolve(kv),
    });
    const app = createNativePushRoutes(storage);
    assertEquals((await app.request("https://example.com/status")).status, 401);
    await storage.createAccount({
      id: "push-user",
      username: "push-user",
      createdAt: new Date().toISOString(),
    });
    await storage.saveSession({
      tokenHash: await sessionTokenHash("push-session"),
      userId: "push-user",
      username: "push-user",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const csrf = csrfTokenForRequest(undefined, "https://example.com");
    const cookie = `heybox_session=push-session; heybox_csrf=${csrf.token}`;
    const status = await app.request("https://example.com/status", {
      headers: { cookie },
    });
    assertEquals(await status.json(), { configured: false, appId: null });
    /** @param {unknown} body 请求数据。 @param {string} token CSRF 校验值。 @return {Promise<Response>} 路由响应。 */
    const request = (body: unknown, token = csrf.token) =>
      Promise.resolve(
        app.request("https://example.com/device", {
          method: "POST",
          headers: {
            cookie,
            "x-csrf-token": token,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    const binding = {
      token: "fixture-device-token",
      enabled: true,
      appId: "12345",
    };
    assertEquals((await request(binding, "wrong")).status, 403);
    assertEquals((await request(null)).status, 400);
    assertEquals((await request(binding)).status, 503);
    names.forEach((name, index) =>
      Deno.env.set(name, ["12345", "test-client", "test-secret"][index])
    );
    assertEquals((await request(binding)).status, 200);
    assertEquals((await storage.nativePush!.list("push-user")).length, 1);
    assertEquals((await request({ ...binding, enabled: false })).status, 200);
    assertEquals(await storage.nativePush!.list("push-user"), []);
  } finally {
    names.forEach((name, index) => {
      const value = previous[index];
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    });
    kv.close();
  }
});
