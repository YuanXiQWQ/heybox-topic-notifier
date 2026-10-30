/** @file 邀请并发核销、账号权限和隐私边界的实际存储及路由回归测试。 */
import { Hono } from "@hono/hono";
import { assert, assertEquals } from "@std/assert";
import { createKvStorage } from "./storage/kv.ts";
import { createTursoStorage } from "./storage/turso.ts";
import { MemorySqlClient } from "./storage/sqlite_test_helpers.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { createAdminRoutes } from "./admin_routes.ts";
import {
  createAuthRoutes,
  hashPassword,
  readAuthSession,
  verifyAccountPassword,
} from "./auth.ts";
import { redirectWithSession } from "./auth/session.ts";
import {
  newInvitationCode,
  normalizeInvitation,
  secretDigest,
} from "./auth/roles.ts";
import { testCsrfHeaders, testCsrfToken } from "./test_helpers.ts";
import type { Storage } from "./storage/types.ts";
import type { UserAccount } from "./models.ts";
import { getMessages } from "./locales/index.ts";
import { locales } from "./locales/types.ts";
import { renderAdmin } from "./views/admin.ts";

/** @param {string} id 账号标识。 @param {UserAccount["role"]} role 角色。 @return {UserAccount} 测试账号。 */
function user(id: string, role: UserAccount["role"] = "user"): UserAccount {
  return { id, username: id, role, createdAt: new Date().toISOString() };
}

Deno.test("admin view escapes untrusted content and preserves expiry and role boundaries across locales", () => {
  for (const locale of locales) {
    const messages = getMessages(locale);
    const page = renderAdmin({
      account: user("manager", "admin"),
      settings: { ...defaultAppSettingsFromEnv(), locale },
      csrfToken: testCsrfToken,
      invitations: [{
        id: "test-id",
        createdBy: "manager",
        createdAt: "2020-01-01T00:00:00Z",
        expiresAt: "2020-01-02T00:00:00Z",
        note: '<img src=x onerror="alert(1)">',
      }],
      codes: [],
      error: "",
      saved: false,
    });
    assert(page.includes(messages.invitationExpired));
    assert(page.includes("&lt;img"));
    assert(!page.includes("<img src=x"));
    assert(!page.includes("/admin/users"));
    assert(!page.includes('<script src="/static/fun/'));
    assert(!page.includes('<script type="module" src="/static/fun/'));
    const settingsIndex = page.indexOf(
      'class="nav-account-menu-action" href="/settings"',
    );
    const adminIndex = page.indexOf(
      'class="nav-account-menu-action" href="/admin"',
    );
    const logoutIndex = page.indexOf('action="/logout');
    assert(
      settingsIndex > 0 && settingsIndex < adminIndex &&
        adminIndex < logoutIndex,
    );
  }
});
/** @param {Storage} storage 真实存储。 @return {Promise<void>} 两种后端共用的安全契约。 */
async function contract(storage: Storage): Promise<void> {
  const admin = storage.administration!;
  await storage.saveAccount(user("owner", "superadmin"));
  await storage.saveAccount(user("manager", "admin"));
  await storage.saveAccount(user("ordinary"));
  const invite = {
    id: await secretDigest(normalizeInvitation(newInvitationCode())),
    createdBy: "manager",
    createdAt: new Date().toISOString(),
    note: "test",
  };
  assert((await admin.issue("ordinary", [invite])) !== "ok");
  assertEquals(await admin.issue("manager", [invite]), "ok");
  const outcomes = await Promise.all([
    admin.register({ account: user("alice", "superadmin") }, invite.id),
    admin.register({ account: user("bravo") }, invite.id),
  ]);
  assertEquals(outcomes.filter((v) => v === "ok").length, 1);
  const winner = await storage.getAccountById("alice") ??
    await storage.getAccountById("bravo");
  assert(winner);
  assertEquals(winner.role, "user");
  const before = await storage.getAccountById("ordinary");
  assert(before);
  assertEquals(
    await admin.editUser("owner", { ...before, role: "admin", roleVersion: 0 }),
    "ok",
  );
  assert(
    await storage.updateAccount({
      ...before,
      displayName: "stale",
      role: "superadmin",
    }),
  );
  assertEquals((await storage.getAccountById("ordinary"))?.role, "admin");
  assert(
    (await admin.editUser("manager", {
      ...before,
      role: "superadmin",
      roleVersion: 1,
    })) !== "ok",
  );
  assert(
    (await admin.editUser("owner", {
      ...before,
      role: "superadmin",
      roleVersion: 0,
    })) !== "ok",
  );
  assert((await admin.deleteUser("owner", "owner", 0)) !== "ok");
  assert(
    (await admin.editUser("owner", {
      ...user("owner"),
      role: "user",
      roleVersion: 0,
    })) !== "ok",
  );
  const second = { ...invite, id: "second" };
  assertEquals(await admin.issue("manager", [second]), "ok");
  assert(
    (await admin.register({ account: user("owner") }, second.id)) !== "ok",
  );
  assertEquals(
    (await admin.listInvitations()).find((v) => v.id === "second")?.usedAt,
    undefined,
  );
  assertEquals(await admin.revoke("manager", "second"), "ok");
  assert((await admin.register({ account: user("nope") }, "second")) !== "ok");
  const expired = {
    ...invite,
    id: "expired",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  assertEquals(await admin.issue("manager", [expired]), "ok");
  assert((await admin.register({ account: user("late") }, "expired")) !== "ok");
  const password = "a secure test password";
  const credentials = {
    ...await hashPassword(password),
    userId: "created",
    updatedAt: new Date().toISOString(),
  };
  assertEquals(
    await admin.createUser("owner", {
      account: user("created"),
      password: credentials,
    }),
    "ok",
  );
  const account = await storage.getAccountById("created");
  assert(account);
  assert(await verifyAccountPassword(password, account, storage));
  assert(!JSON.stringify(account).includes(password));
  assert(
    !JSON.stringify(await storage.getPasswordCredential("created")).includes(
      password,
    ),
  );
  const login = await redirectWithSession(
    "https://example.com",
    "/",
    account,
    storage,
    { sessionMaxAgeSeconds: 600 },
  );
  const cookie = login.headers.get("set-cookie")!;
  assert(await readAuthSession(cookie, storage));
  assertEquals(await admin.deleteUser("owner", "created", 0), "ok");
  assertEquals(await readAuthSession(cookie, storage), undefined);
  assertEquals(await storage.getPasswordCredential("created"), undefined);
  assertEquals(await storage.getAccountByUsername("created"), undefined);
  assert(
    (await admin.register({ account: user("again") }, invite.id)) !== "ok",
  );
}
for (const backend of ["kv", "turso"]) {
  Deno.test(`administration ${backend} atomic invitation and role boundaries`, async () => {
    const kv = backend === "kv" ? await Deno.openKv(":memory:") : undefined,
      sql = backend === "turso" ? new MemorySqlClient() : undefined;
    try {
      const settings = defaultAppSettingsFromEnv();
      await contract(
        kv
          ? createKvStorage(settings, { openKv: () => Promise.resolve(kv) })
          : createTursoStorage(settings, { client: sql }),
      );
    } finally {
      kv?.close();
      sql?.close();
    }
  });
}

Deno.test("admin routes isolate roles, require CSRF and session reauthentication, never expose secrets", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {
      openKv: () => Promise.resolve(kv),
    });
    const password = "test owner password";
    for (
      const [id, role] of [["owner", "superadmin"], ["manager", "admin"], [
        "ordinary",
        "user",
      ]] as const
    ) {
      await storage.saveAccount({
        ...user(id, role),
        ...await hashPassword(password),
      });
    }
    const app = new Hono();
    app.route("/admin", createAdminRoutes(storage));
    app.route("/", createAuthRoutes(storage));
    /** @param {string} id 账号。 @return {Promise<string>} 测试会话。 */
    const cookie = async (id: string): Promise<string> => {
      const response = await redirectWithSession(
        "http://localhost",
        "/",
        (await storage.getAccountById(id))!,
        storage,
        { sessionMaxAgeSeconds: 600 },
      );
      return response.headers.get("set-cookie")! + "; heybox_csrf=" +
        testCsrfToken;
    };
    const ordinary = await cookie("ordinary"),
      manager = await cookie("manager"),
      owner = await cookie("owner");
    assertEquals(
      (await app.request("/admin", { headers: { cookie: ordinary } })).status,
      403,
    );
    const managerPage =
      await (await app.request("/admin", { headers: { cookie: manager } }))
        .text();
    assert(managerPage.includes("/admin/invitations"));
    assert(!managerPage.includes("/admin/users"));
    assert(!managerPage.includes("currentPassword"));
    assert(!managerPage.includes('black-forest-slot="admin'));
    const locked =
      await (await app.request("/admin", { headers: { cookie: owner } }))
        .text();
    assert(locked.includes("/admin/unlock"));
    assert(!locked.includes('name="role"'));
    /** @param {string} path 请求路径。 @param {string} cookieHeader 会话。 @param {Record<string,string>} values 字段。 @return {Promise<Response>} 响应。 */
    const post = (
      path: string,
      cookieHeader: string,
      values: Record<string, string> = {},
    ) => {
      return app.request(path, {
        method: "POST",
        headers: { cookie: cookieHeader },
        body: new URLSearchParams({ csrfToken: testCsrfToken, ...values }),
      });
    };
    assertEquals(
      (await post("/admin/users/create", manager, {
        username: "hacker",
        role: "superadmin",
      })).status,
      403,
    );
    assertEquals(
      (await post("/admin/users/create", owner, {
        username: "hacker",
        role: "superadmin",
      })).status,
      403,
    );
    assertEquals(
      (await post("/admin/invitations", manager, {
        count: "1",
        csrfToken: "wrong",
      })).status,
      403,
    );
    assertEquals(
      (await app.request("/admin/invitations", {
        method: "POST",
        headers: { cookie: manager, origin: "https://evil.example" },
        body: new URLSearchParams({ csrfToken: testCsrfToken, count: "1" }),
      })).status,
      403,
    );
    assertEquals(
      (await post("/admin/unlock", owner, { currentPassword: password }))
        .status,
      303,
    );
    const unlocked =
      await (await app.request("/admin", { headers: { cookie: owner } }))
        .text();
    assert(unlocked.includes('name="role"'));
    assert(!unlocked.includes("passwordHash"));
    assert(!unlocked.includes("passwordSalt"));
    assert(!unlocked.includes(password));
    assertEquals(
      (await post("/admin/users/create", owner, {
        username: "newperson",
        displayName: "New Person",
        role: "admin",
        password,
        confirmPassword: password,
      })).status,
      303,
    );
    assertEquals(
      (await storage.getAccountByUsername("newperson"))?.role,
      "admin",
    );
    const secondSession = await cookie("owner");
    assertEquals(
      (await post("/admin/users/create", secondSession)).status,
      403,
    );
    await kv.set(["accounts", "owner"], {
      ...user("owner", "user"),
      ...await hashPassword(password),
    });
    assertEquals((await post("/admin/users/create", owner)).status, 403);
    const denied = await app.request("/register", {
      method: "POST",
      headers: testCsrfHeaders(),
      body: new URLSearchParams({
        csrfToken: testCsrfToken,
        username: "uninvited",
        password,
        confirmPassword: password,
        role: "superadmin",
      }),
    });
    assertEquals(denied.status, 303);
    assertEquals(await storage.getAccountByUsername("uninvited"), undefined);
  } finally {
    kv.close();
  }
});

Deno.test("administration mirrors committed results and prevents migration from restoring roles or deleted users", async () => {
  const kv = await Deno.openKv(":memory:"), sql = new MemorySqlClient();
  try {
    const settings = defaultAppSettingsFromEnv(),
      source = createKvStorage(settings, { openKv: () => Promise.resolve(kv) }),
      replica = createTursoStorage(settings, { client: sql });
    const { createDualWriteStorage } = await import("./storage/dual_write.ts");
    const failures: unknown[] = [];
    const storage = createDualWriteStorage(source, replica, {
      onMirrorFailure: (failure) => failures.push(failure),
    });
    await storage.saveAccount(user("owner", "superadmin"));
    await storage.saveAccount(user("target"));
    const record = {
      id: "mirror-invite",
      createdAt: new Date().toISOString(),
      createdBy: "owner",
      note: "mirror",
    };
    assertEquals(await storage.administration!.issue("owner", [record]), "ok");
    assertEquals(
      await storage.administration!.register(
        { account: user("joined") },
        record.id,
      ),
      "ok",
    );
    assertEquals((await replica.getAccountById("joined"))?.role, "user");
    assert(
      (await replica.administration!.register(
        { account: user("duplicate") },
        record.id,
      )) !== "ok",
    );
    assertEquals(
      await storage.administration!.editUser("owner", {
        id: "target",
        username: "target",
        displayName: "Target",
        role: "admin",
        roleVersion: 0,
      }),
      "ok",
    );
    assertEquals((await replica.getAccountById("target"))?.role, "admin");
    assertEquals(
      await storage.administration!.deleteUser("owner", "target", 1),
      "ok",
    );
    await replica.saveAccount(user("target", "superadmin"));
    assertEquals(await replica.getAccountById("target"), undefined);
    assertEquals(failures, []);
  } finally {
    kv.close();
    sql.close();
  }
});

/** @param {Storage} storage 真实后端。 @return {Promise<void>} 公开注册、密码处理与邮箱注册延迟落库验证。 */
async function registrationContract(storage: Storage): Promise<void> {
  const { createEmailVerificationChallenge } = await import(
    "./auth/email_verification.ts"
  );
  const config = {
    codeSecret: "isolated-registration-test",
    codeTtlSeconds: 600,
    maxAttempts: 5,
  };
  const app = createAuthRoutes(storage, { emailVerification: config });
  await storage.saveAccount(user("owner", "superadmin"));
  const code = newInvitationCode(),
    digest = await secretDigest(normalizeInvitation(code));
  await storage.administration!.issue("owner", [{
    id: digest,
    createdAt: new Date().toISOString(),
    createdBy: "owner",
    note: "test",
  }]);
  const password = "registration test password";
  const submit = (path: string, fields: Record<string, string>) =>
    app.request(path, {
      method: "POST",
      headers: testCsrfHeaders(),
      body: new URLSearchParams({ csrfToken: testCsrfToken, ...fields }),
    });
  const result = await submit("/register", {
    username: "invited",
    password,
    confirmPassword: password,
    invitationCode: code,
    role: "superadmin",
  });
  assertEquals(result.status, 303);
  const account = await storage.getAccountByUsername("invited");
  assert(account);
  assertEquals(account.role, "user");
  assert(await verifyAccountPassword(password, account, storage));
  assert(!JSON.stringify(account).includes(password));
  assert(
    !JSON.stringify(await storage.administration!.listInvitations()).includes(
      code,
    ),
  );
  await submit("/register", {
    username: "replay",
    password,
    confirmPassword: password,
    invitationCode: code,
  });
  assertEquals(await storage.getAccountByUsername("replay"), undefined);
  const challenge = await createEmailVerificationChallenge({
    config,
    email: "mailperson@example.com",
    purpose: "primary_login",
    code: "123456",
    id: "new-email",
  });
  await storage.savePendingEmailVerification(challenge.verification);
  const response = await submit("/login", {
    authMethod: "email",
    email: "mailperson@example.com",
    verificationId: "new-email",
    code: "123456",
  });
  assertEquals(response.status, 200);
  assertEquals(await storage.getAccountByUsername("mailperson"), undefined);
  const pending = /name="pending" value="([^"]+)"/.exec(await response.text())
    ?.[1];
  assert(pending);
  const mailCode = newInvitationCode(),
    mailDigest = await secretDigest(normalizeInvitation(mailCode));
  await storage.administration!.issue("owner", [{
    id: mailDigest,
    createdAt: new Date().toISOString(),
    createdBy: "owner",
    note: "mail",
  }]);
  const unauthorized = await submit("/register/invitation", {
    pending,
    invitationCode: mailCode,
    csrfToken: "invalid",
  });
  assertEquals(unauthorized.status, 403);
  assertEquals(
    (await submit("/register/invitation", {
      pending,
      invitationCode: mailCode,
    })).status,
    303,
  );
  const mail = await storage.getAccountByUsername("mailperson");
  assert(mail);
  assertEquals(mail.role, "user");
  assertEquals(
    (await storage.getEmailCredential(mail.id, "mailperson@example.com"))
      ?.verified,
    true,
  );
  const again = await createEmailVerificationChallenge({
    config,
    email: "mailperson@example.com",
    purpose: "primary_login",
    code: "654321",
    id: "existing-email",
  });
  await storage.savePendingEmailVerification(again.verification);
  assertEquals(
    (await submit("/login", {
      authMethod: "email",
      email: "mailperson@example.com",
      verificationId: "existing-email",
      code: "654321",
    })).status,
    303,
  );
}
for (const backend of ["kv", "turso"]) {
  Deno.test(`invited registration ${backend} protects password and pending identities`, async () => {
    const kv = backend === "kv" ? await Deno.openKv(":memory:") : undefined,
      sql = backend === "turso" ? new MemorySqlClient() : undefined;
    try {
      const settings = defaultAppSettingsFromEnv();
      await registrationContract(
        kv
          ? createKvStorage(settings, { openKv: () => Promise.resolve(kv) })
          : createTursoStorage(settings, { client: sql }),
      );
    } finally {
      kv?.close();
      sql?.close();
    }
  });
}
