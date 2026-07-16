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

Deno.test("auth middleware accepts a valid session cookie", async () => {
  const app = createTestApp();
  const registerResponse = await register(app, "alice", "correct-password");

  const response = await app.request("/settings", {
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "settings");
});

function createTestApp(storage = createMemoryStorage()): Hono {
  const app = new Hono();
  app.route("/", createAuthRoutes(storage));
  app.get("/healthz", (c) => c.text("ok"));
  app.use("*", createAuthMiddleware(storage));
  app.get("/settings", (c) => c.text("settings"));
  return app;
}

function createMemoryStorage(): ReturnType<typeof createKvStorage> & {
  savedSessions: UserSession[];
} {
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
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
    getSession: (tokenHash: string) => Promise.resolve(sessionsByTokenHash.get(tokenHash)),
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

function register(app: Hono, username: string, password: string): Promise<Response> {
  return Promise.resolve(
    app.request("/register", {
      body: new URLSearchParams({ password, username }),
      method: "POST",
    }),
  );
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
