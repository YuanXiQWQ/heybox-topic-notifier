/** @file 验证浏览器订阅接口的认证、CSRF、账号归属及密钥隔离。 */
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";
import { createECDH } from "node:crypto";
import { createWebPushRoutes } from "./web_push_routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { sessionTokenHash } from "./auth/session.ts";
import { assert, assertEquals, testCsrfToken } from "./test_helpers.ts";

Deno.test("browser subscriptions require session and CSRF and never accept client account IDs", async () => {
  const kv = await Deno.openKv(":memory:");
  const keys = webPush.generateVAPIDKeys();
  const values = {
    WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_SUBJECT: "mailto:test@example.com",
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, Deno.env.get(key)]),
  );
  try {
    for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {
      openKv: () => Promise.resolve(kv),
    });
    const app = createWebPushRoutes(storage);
    const token = "test-only-session";
    const sessionHash = await sessionTokenHash(token);
    await storage.saveSession({
      tokenHash: sessionHash,
      userId: "alice",
      username: "alice",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const headers = {
      cookie: `heybox_session=${token}; heybox_csrf=${testCsrfToken}`,
      "content-type": "application/json",
    };
    assertEquals((await app.request("/status")).status, 401);
    const configResponse = await app.request("/status", { headers });
    assertEquals(configResponse.headers.get("cache-control"), "no-store");
    const config = await configResponse.json();
    assertEquals(config.publicKey, keys.publicKey);
    assert(!JSON.stringify(config).includes(keys.privateKey));
    assertEquals(
      (await app.request("/subscription", {
        method: "POST",
        headers,
        body: "{}",
      })).status,
      403,
    );
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const subscription = {
      endpoint: "https://fcm.googleapis.com/push/test",
      keys: {
        auth: "AAAAAAAAAAAAAAAAAAAAAA",
        p256dh: ecdh.getPublicKey().toString("base64url"),
      },
    };
    const requestHeaders = { ...headers, "x-csrf-token": testCsrfToken };
    const saved = await app.request("/subscription", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ userId: "bob", enabled: true, subscription }),
    });
    assertEquals(saved.status, 200);
    assertEquals((await storage.webPush!.list("alice")).length, 1);
    assertEquals(await storage.webPush!.list("bob"), []);
    const deviceId = await sessionTokenHash(subscription.endpoint);
    assertEquals(
      (await (await app.request(`/status?device=${deviceId}`, { headers }))
        .json()).enabled,
      true,
    );
    const blocked = await app.request("/subscription", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        enabled: true,
        subscription: { ...subscription, endpoint: "https://localhost/push" },
      }),
    });
    assertEquals(blocked.status, 400);
    const removed = await app.request("/subscription", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ enabled: false, subscription }),
    });
    assertEquals(removed.status, 200);
    assertEquals(await storage.webPush!.list("alice"), []);
    assertEquals(
      (await (await app.request(`/status?device=${deviceId}`, { headers }))
        .json()).enabled,
      false,
    );
  } finally {
    kv.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
