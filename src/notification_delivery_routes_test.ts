/** @file 验证统一通知测试只产生通知事件，并保持用户隔离和渠道开关。 */
import { assertEquals, assertMatch } from "@std/assert";
import { createRoutes } from "./routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { sessionTokenHash } from "./auth/session.ts";
import { testCsrfForm, testCsrfHeaders } from "./test_helpers.ts";
import { NotificationDeliveryError } from "./services/notifier.ts";
import type { AppContext } from "./services/app_context.ts";

Deno.test("unified notification test fans out despite webhook failure and does not create workspace posts", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const settings = defaultAppSettingsFromEnv();
    settings.notificationProvider = "webhook";
    const storage = createKvStorage(settings, { openKv: () => Promise.resolve(kv) });
    await storage.saveSession({tokenHash: await sessionTokenHash("test-session"), userId: "alice", username: "alice", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString()});
    let otherSent = 0;
    const app = createRoutes({storage, notifier: {sendTest: () => { otherSent++; return Promise.reject(new NotificationDeliveryError("Webhook HTTP 429", 429)); }}} as unknown as AppContext);
    /** @param {boolean} enabled 当前设备通知开关。 @param {string} platform 当前应用平台。 @return {Promise<Response>} 测试响应。 */
    const send = (enabled: boolean, platform = "windows") => Promise.resolve(app.request("/test-notify", {
      method: "POST", headers: testCsrfHeaders({cookie:"heybox_session=test-session", "x-test-notify":"1"}),
      body: testCsrfForm(new URLSearchParams({applicationNotifications:String(enabled), applicationPlatform:platform})),
    }));
    assertEquals((await send(true)).status, 429);
    assertEquals(otherSent, 1);
    const inbox = storage.forUser("alice").nativeNotifications!;
    const {events} = await inbox.read("");
    assertEquals(events.length, 1);
    assertMatch(events[0].cursor, /^\d{16}:[A-Za-z0-9_-]{43}$/);
    assertEquals(await storage.forUser("alice").listPendingMatches(), []);
    assertEquals((await storage.forUser("bob").nativeNotifications!.read("")).events, []);
    await send(false);
    assertEquals(otherSent, 2);
    assertEquals((await inbox.read("")).events.length, 1);
    await storage.forUser("alice").saveSettings({...settings, notificationProvider:"disabled"});
    assertEquals((await send(true)).status, 200);
    assertEquals(otherSent, 2);
    assertEquals((await send(true, "web")).status, 400);
    assertEquals((await send(false)).status, 400);
  } finally { kv.close(); }
});
