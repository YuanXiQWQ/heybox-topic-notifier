/** @file 验证原生登录交接的 PKCE、网页 CSRF、账号一致性和单次消费。 */
import { assert, assertEquals } from "@std/assert";
import { createNativeAuthRoutes } from "./native_auth_routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { readAuthSession, sessionTokenHash } from "./auth/session.ts";
import { csrfTokenForRequest } from "./security/csrf.ts";

Deno.test("native browser login requires PKCE and CSRF and preserves the existing account", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {
      openKv: () => Promise.resolve(kv),
    });
    const app = createNativeAuthRoutes(storage);
    const verifier = "v".repeat(43),
      challenge = await sessionTokenHash(verifier);
    const started = await app.request("https://example.com/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge }),
    });
    assertEquals(started.status, 200);
    const { id } = await started.json();
    const exchange = (proof = verifier) =>
      app.request("https://example.com/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, verifier: proof }),
      });
    assertEquals((await exchange("w".repeat(43))).status, 403);
    assertEquals((await exchange()).status, 202);
    assertEquals(
      (await app.request(`https://example.com/approve?id=${id}`)).status,
      303,
    );
    await storage.createAccount({
      id: "existing-google-user",
      username: "same-account",
      createdAt: new Date().toISOString(),
    });
    await storage.saveSession({
      tokenHash: await sessionTokenHash("browser-session"),
      userId: "existing-google-user",
      username: "same-account",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const csrf = csrfTokenForRequest(undefined, "https://example.com");
    const cookie = "heybox_session=browser-session; heybox_csrf=" + csrf.token;
    const approve = (token: string) =>
      app.request("https://example.com/approve", {
        method: "POST",
        headers: { cookie },
        body: new URLSearchParams({ id, csrfToken: token }),
      });
    assertEquals((await approve("invalid")).status, 403);
    assertEquals((await approve(csrf.token)).status, 200);
    const [left, right] = await Promise.all([exchange(), exchange()]);
    assertEquals([left.status, right.status].sort(), [200, 410]);
    const success = left.status === 200 ? left : right;
    const session = await readAuthSession(
      success.headers.get("set-cookie")!,
      storage,
    );
    assertEquals(session?.userId, "existing-google-user");
    assert(success.headers.get("set-cookie")!.includes("HttpOnly"));
    assertEquals((await exchange()).status, 410);
  } finally {
    kv.close();
  }
});
