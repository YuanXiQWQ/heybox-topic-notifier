/** @file 在 KV 与 Turso 存储上验证管理员 TOTP 授权、防重放及失效边界。 */
import { Hono } from "@hono/hono";
import { assert, assertEquals } from "@std/assert";
import { createAdminRoutes } from "./admin_routes.ts";
import { hashPassword } from "./auth.ts";
import { redirectWithSession } from "./auth/session.ts";
import { secretDigest } from "./auth/roles.ts";
import {
  encryptTotpSecret,
  generateTotpCode,
  totpConfigFromEnv,
} from "./auth/totp.ts";
import { parseCookies } from "./security/cookies.ts";
import { createKvStorage } from "./storage/kv.ts";
import { createTursoStorage } from "./storage/turso.ts";
import { MemorySqlClient } from "./storage/sqlite_test_helpers.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { testCsrfToken } from "./test_helpers.ts";

/** @param {"kv" | "turso"} backend 后端。 @return {Promise<object>} 使用随机测试密钥的隔离路由及存储。 */
async function fixture(backend: "kv" | "turso") {
  const kv = backend === "kv" ? await Deno.openKv(":memory:") : undefined;
  const sql = backend === "turso" ? new MemorySqlClient() : undefined;
  const settings = defaultAppSettingsFromEnv();
  const storage = kv
    ? createKvStorage(settings, { openKv: () => Promise.resolve(kv) })
    : createTursoStorage(settings, { client: sql! });
  const totp = {
    ...totpConfigFromEnv(() => undefined),
    secretEncryptionKey: crypto.randomUUID(),
  };
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const password = "isolated owner password";
  const account = {
    id: "owner",
    username: "owner",
    role: "superadmin" as const,
    roleVersion: 0,
    createdAt: new Date().toISOString(),
    ...await hashPassword(password),
  };
  await storage.saveAccount(account);
  const credential = {
    userId: account.id,
    credentialId: "authenticator",
    enabledAt: new Date().toISOString(),
    secretEncrypted: await encryptTotpSecret(secret, totp.secretEncryptionKey),
    recoveryCodeHashes: [],
  };
  await storage.saveTotpCredential(credential);
  const app = new Hono();
  app.route("/admin", createAdminRoutes(storage, totp));
  /** @return {Promise<string>} 独立登录会话及 CSRF Cookie。 */
  async function session(): Promise<string> {
    const response = await redirectWithSession(
      "http://localhost",
      "/",
      account,
      storage,
      { sessionMaxAgeSeconds: 3600 },
    );
    return response.headers.get("set-cookie")! + "; heybox_csrf=" +
      testCsrfToken;
  }
  /** @param {string} cookie 登录会话。 @param {Record<string,string>} values 表单。 @return {Promise<Response>} 解锁响应。 */
  function unlock(
    cookie: string,
    values: Record<string, string>,
  ): Promise<Response> {
    return Promise.resolve(app.request("/admin/unlock", {
      method: "POST",
      headers: { cookie },
      body: new URLSearchParams({ csrfToken: testCsrfToken, ...values }),
    }));
  }
  /** @param {string} cookie 登录会话。 @return {Promise<string>} 授权键。 */
  async function grantId(cookie: string): Promise<string> {
    return await secretDigest(
      "admin:" + parseCookies(cookie).get("heybox_session"),
    );
  }
  /** @param {string} cookie 登录会话。 @return {Promise<boolean>} 是否可访问用户列表。 */
  async function isUnlocked(cookie: string): Promise<boolean> {
    const response = await app.request("/admin", { headers: { cookie } });
    assertEquals(response.headers.get("cache-control"), "no-store, private");
    return (await response.text()).includes('name="role"');
  }
  /** 关闭隔离存储。 */
  function close() {
    kv?.close();
    sql?.close();
  }
  return {
    storage,
    totp,
    secret,
    password,
    account,
    credential,
    app,
    session,
    unlock,
    grantId,
    isUnlocked,
    close,
  };
}

for (const backend of ["kv", "turso"] as const) {
  Deno.test(`${backend}: admin rejects passwords, invalid/expired TOTP and limits attempts`, async () => {
    const f = await fixture(backend);
    try {
      const cookie = await f.session();
      const page =
        await (await f.app.request("/admin", { headers: { cookie } })).text();
      assert(page.includes('name="totpCode"'));
      assert(!page.includes('name="currentPassword"'));
      assert(!page.includes(f.credential.secretEncrypted));
      const staleCode = await generateTotpCode(
        f.secret,
        f.totp,
        new Date(Date.now() - 300000),
      );
      for (
        const values of [
          { currentPassword: f.password },
          { totpCode: "invalid" },
          { totpCode: staleCode },
          { totpCode: "" },
          { totpCode: "123456789" },
        ] as Record<string, string>[]
      ) {
        assertEquals((await f.unlock(cookie, values)).status, 200);
        assertEquals(await f.isUnlocked(cookie), false);
      }
      assertEquals(
        (await f.unlock(cookie, {
          totpCode: await generateTotpCode(f.secret, f.totp),
        })).status,
        429,
      );
      assertEquals(await f.isUnlocked(cookie), false);
    } finally {
      f.close();
    }
  });

  Deno.test(`${backend}: admin TOTP is atomic across sessions and bound to current credential`, async () => {
    const f = await fixture(backend);
    try {
      const cookies = [await f.session(), await f.session()];
      const code = await generateTotpCode(f.secret, f.totp);
      const responses = await Promise.all(
        cookies.map((cookie) => f.unlock(cookie, { totpCode: code })),
      );
      assertEquals(responses.filter((r) => r.status === 303).length, 1);
      const winner = cookies[responses.findIndex((r) => r.status === 303)];
      const loser = cookies[responses.findIndex((r) => r.status !== 303)];
      assertEquals(await f.isUnlocked(winner), true);
      assertEquals(await f.isUnlocked(loser), false);
      assertEquals(
        (await f.unlock(loser, { totpCode: ` ${code} ` })).status,
        200,
      );
      assertEquals(await f.isUnlocked(loser), false);
      const id = await f.grantId(winner);
      const grant = (await f.storage.administration!.getTemporary(id))!;
      assertEquals(grant.method, "totp");
      assert(!JSON.stringify(grant).includes(code));
      await f.storage.administration!.putTemporary({
        ...grant,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      assertEquals(await f.isUnlocked(winner), false);
      await f.storage.administration!.putTemporary({
        ...grant,
        roleVersion: 1,
      });
      assertEquals(await f.isUnlocked(winner), false);
      await f.storage.administration!.putTemporary(grant);
      await f.storage.saveTotpCredential({
        ...f.credential,
        secretEncrypted: await encryptTotpSecret(
          crypto.getRandomValues(new Uint8Array(20)),
          f.totp.secretEncryptionKey,
        ),
      });
      assertEquals(await f.isUnlocked(winner), false);
      await f.storage.saveTotpCredential(f.credential);
      assertEquals(await f.isUnlocked(winner), true);
      await f.storage.deleteTotpCredential("owner", f.credential.credentialId);
      assertEquals(await f.isUnlocked(winner), false);
      const page =
        await (await f.app.request("/admin", { headers: { cookie: winner } }))
          .text();
      assert(page.includes("/settings#account-two-step-heading"));
      assert(!page.includes('name="totpCode"'));
      assertEquals((await f.unlock(loser, { totpCode: code })).status, 200);
      assertEquals(await f.isUnlocked(loser), false);
    } finally {
      f.close();
    }
  });

  Deno.test(`${backend}: legacy password grants and missing server TOTP configuration fail closed`, async () => {
    const f = await fixture(backend);
    try {
      const cookie = await f.session();
      const id = await f.grantId(cookie);
      await f.storage.administration!.putTemporary({
        id,
        binding: id,
        userId: "owner",
        roleVersion: 0,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      assertEquals(await f.isUnlocked(cookie), false);
      const code = await generateTotpCode(f.secret, f.totp);
      const disabled = new Hono();
      disabled.route("/admin", createAdminRoutes(f.storage));
      const response = await disabled.request("/admin/unlock", {
        method: "POST",
        headers: { cookie },
        body: new URLSearchParams({ csrfToken: testCsrfToken, totpCode: code }),
      });
      assertEquals(response.status, 200);
      assertEquals(await f.isUnlocked(cookie), false);
      assertEquals((await f.unlock(cookie, { totpCode: code })).status, 303);
      assertEquals(await f.isUnlocked(cookie), true);
      const page =
        await (await disabled.request("/admin", { headers: { cookie } }))
          .text();
      assert(!page.includes('name="role"'));
    } finally {
      f.close();
    }
  });
}
