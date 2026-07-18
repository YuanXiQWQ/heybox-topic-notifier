/**
 * @file 本文件验证认证中间件和登录注册路由行为。
 */
import { Hono } from "@hono/hono";
import { createAuthMiddleware, createAuthRoutes, readAuthSession } from "./auth.ts";
import type { UserAccount, UserSession } from "./models.ts";
import type { createKvStorage } from "./storage/kv.ts";

Deno.test("auth middleware redirects protected pages to login", async () => {
  const app = createTestApp();

  const response = await app.request("/settings");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/login?returnTo=%2Fsettings");
});

Deno.test("auth routes render login page without extra configuration", async () => {
  const app = new Hono();
  app.route("/", createAuthRoutes(createMemoryStorage()));

  const response = await app.request("/login");

  assertEquals(response.status, 200);
  assertEquals((await response.text()).includes("登录"), true);
});

Deno.test("auth routes register users with hashed passwords and a session cookie", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  const form = new URLSearchParams({
    password: "correct-password",
    returnTo: "/settings",
    username: "Alice",
  });

  const response = await app.request("/register", { body: form, method: "POST" });
  const account = await storage.getAccountByUsername("alice");
  const session = await readAuthSession(response.headers.get("set-cookie") ?? "", storage);

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings");
  assertEquals(account?.username, "alice");
  assertEquals(account?.passwordHash === "correct-password", false);
  assertEquals(session?.userId, account?.id);
  assertEquals(storage.savedSessions.length, 1);
  assertEquals(
    response.headers.get("set-cookie")?.includes(storage.savedSessions[0].tokenHash),
    false,
  );
});

Deno.test("auth routes reject duplicate registrations", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");

  const response = await register(app, "alice", "another-password");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/register?error=exists");
});

Deno.test("auth routes atomically create only one account for concurrent registrations", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);

  const responses = await Promise.all([
    register(app, "alice", "correct-password"),
    register(app, "alice", "another-password"),
  ]);

  assertEquals(
    responses.map((response) => response.headers.get("location")).sort(),
    ["/", "/register?error=exists"],
  );
  assertEquals((await storage.listAccounts()).length, 1);
});

Deno.test("auth routes login existing users", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");
  const form = new URLSearchParams({
    password: "correct-password",
    returnTo: "/history",
    username: "alice",
  });

  const response = await app.request("/login", { body: form, method: "POST" });
  const session = await readAuthSession(response.headers.get("set-cookie") ?? "", storage);

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/history");
  assertEquals(session?.username, "alice");
});

Deno.test("auth routes lock repeated failed login attempts", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await login(app, "alice", "incorrect-password");
    assertEquals(response.headers.get("location"), "/login?error=invalid&returnTo=%2F");
  }

  const lockedResponse = await login(app, "alice", "incorrect-password");
  const blockedCorrectPasswordResponse = await login(app, "alice", "correct-password");

  assertEquals(lockedResponse.headers.get("location"), "/login?error=rateLimited&returnTo=%2F");
  assertEquals(
    blockedCorrectPasswordResponse.headers.get("location"),
    "/login?error=rateLimited&returnTo=%2F",
  );
});

Deno.test("auth middleware accepts a valid session cookie", async () => {
  const app = createTestApp();
  const registerResponse = await register(app, "alice", "correct-password");

  const response = await app.request("/settings", {
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "settings");
});

/**
 * 创建认证测试应用。
 *
 * @param storage 测试存储。
 * @return Hono 测试应用。
 */
function createTestApp(storage = createMemoryStorage()): Hono {
  const app = new Hono();
  app.route("/", createAuthRoutes(storage));
  app.get("/healthz", (c) => c.text("ok"));
  app.use("*", createAuthMiddleware(storage));
  app.get("/settings", (c) => c.text("settings"));
  return app;
}

/**
 * 创建认证测试使用的内存存储。
 *
 * @return 带会话记录能力的内存存储。
 */
function createMemoryStorage(): ReturnType<typeof createKvStorage> & {
  savedSessions: UserSession[];
} {
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
  const loginFailuresByUsername = new Map<string, { failures: number; lockedUntil?: string }>();
  const sessionsByTokenHash = new Map<string, UserSession>();
  const savedSessions: UserSession[] = [];

  return {
    savedSessions,
    forUser: () =>
      ({}) as ReturnType<typeof createKvStorage>["forUser"] extends (
        userId: string,
      ) => infer T ? T
        : never,
    getAccountById: (id: string) => Promise.resolve(accountsById.get(id)),
    getAccountByUsername: (username: string) => {
      const id = accountIdsByUsername.get(username.trim().toLowerCase());
      return Promise.resolve(id ? accountsById.get(id) : undefined);
    },
    listAccounts: () => Promise.resolve(Array.from(accountsById.values())),
    saveAccount: (account: UserAccount) => {
      accountsById.set(account.id, account);
      accountIdsByUsername.set(account.username.trim().toLowerCase(), account.id);
      return Promise.resolve();
    },
    createAccount: (account: UserAccount) => {
      const username = account.username.trim().toLowerCase();
      if (accountsById.has(account.id) || accountIdsByUsername.has(username)) {
        return Promise.resolve(false);
      }

      accountsById.set(account.id, account);
      accountIdsByUsername.set(username, account.id);
      return Promise.resolve(true);
    },
    getLoginFailure: (username: string) =>
      Promise.resolve(loginFailuresByUsername.get(username.trim().toLowerCase())),
    recordLoginFailure: (username: string, maxFailures: number, lockoutMs: number) => {
      const key = username.trim().toLowerCase();
      const previous = loginFailuresByUsername.get(key);
      const failures = (previous?.failures ?? 0) + 1;
      const failure = {
        failures,
        ...(failures >= maxFailures
          ? { lockedUntil: new Date(Date.now() + lockoutMs).toISOString() }
          : {}),
      };
      loginFailuresByUsername.set(key, failure);
      return Promise.resolve(failure);
    },
    clearLoginFailures: (username: string) => {
      loginFailuresByUsername.delete(username.trim().toLowerCase());
      return Promise.resolve();
    },
    getSession: (tokenHash: string) => Promise.resolve(sessionsByTokenHash.get(tokenHash)),
    /**
     * 保存测试会话并记录保存历史。
     *
     * @param session 用户会话。
     * @return 保存完成后的 Promise。
     */
    saveSession(session: UserSession) {
      savedSessions.push(session);
      sessionsByTokenHash.set(session.tokenHash, session);
      return Promise.resolve();
    },
    deleteSession: (tokenHash: string) => {
      sessionsByTokenHash.delete(tokenHash);
      return Promise.resolve();
    },
  } as unknown as ReturnType<typeof createKvStorage> & { savedSessions: UserSession[] };
}

/**
 * 提交注册请求。
 *
 * @param app Hono 测试应用。
 * @param username 用户名。
 * @param password 密码。
 * @return 注册响应。
 */
function register(app: Hono, username: string, password: string): Promise<Response> {
  return Promise.resolve(
    app.request("/register", {
      body: new URLSearchParams({ password, username }),
      method: "POST",
    }),
  );
}

/**
 * 提交登录请求。
 *
 * @param app Hono 测试应用。
 * @param username 用户名。
 * @param password 密码。
 * @return 登录响应。
 */
function login(app: Hono, username: string, password: string): Promise<Response> {
  return Promise.resolve(
    app.request("/login", {
      body: new URLSearchParams({ password, username }),
      method: "POST",
    }),
  );
}

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
