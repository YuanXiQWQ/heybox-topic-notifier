/**
 * @file 本文件验证认证中间件和登录注册路由行为。
 */
import { Hono } from "@hono/hono";
import {
  type AuthOptions,
  createAuthMiddleware,
  createAuthRoutes,
  hashPassword,
  readAuthSession,
} from "./auth.ts";
import { turnstileResponseFieldName } from "./auth/turnstile.ts";
import type {
  AppSettings,
  PasswordCredential,
  UserAccount,
  UserSession,
} from "./models.ts";
import type { createKvStorage } from "./storage/kv.ts";
import {
  addUniqueAccount,
  assertEquals,
  createMemoryRateLimitRecorder,
  submitLogin as login,
  submitRegistration as register,
  testCsrfForm,
  testCsrfHeaders,
} from "./test_helpers.ts";

Deno.test("auth middleware redirects protected pages to login", async () => {
  const app = createTestApp();

  const response = await app.request("/settings");

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/login?locale=zh-CN&returnTo=%2Fsettings",
  );
});

Deno.test("auth routes render login page without extra configuration", async () => {
  const app = new Hono();
  app.route("/", createAuthRoutes(createMemoryStorage()));

  const response = await app.request("/login");

  assertEquals(response.status, 200);
  assertEquals((await response.text()).includes("登录"), true);
});

Deno.test("auth routes render Turnstile widget when enabled", async () => {
  const app = createTestApp(createMemoryStorage(), turnstileAuthOptions());

  const response = await app.request("/register");
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(
    html.includes("https://challenges.cloudflare.com/turnstile/v0/api.js"),
    true,
  );
  assertEquals(html.includes('class="auth-turnstile cf-turnstile"'), true);
  assertEquals(html.includes('data-sitekey="test-site-key"'), true);
});

Deno.test("auth routes localize anonymous pages with a language-only navigation bar", async () => {
  const app = createTestApp();

  const response = await app.request("/login?locale=en-US&error=rateLimited");
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(html.includes('lang="en-US"'), true);
  assertEquals(html.includes("Sign in"), true);
  assertEquals(
    html.includes("Too many sign-in attempts. Try again in 15 minutes."),
    true,
  );
  assertEquals(html.includes("Confirm password"), false);
  assertEquals(html.includes('aria-label="Authentication navigation"'), true);
  assertEquals(html.includes('class="auth-language-menu"'), true);
  assertEquals(html.includes('class="auth-language-icon"'), true);
  assertEquals(html.includes('viewBox="0 -960 960 960"'), true);
  assertEquals(html.includes('d="m476-80'), true);
  assertEquals(html.includes("<summary"), true);
  assertEquals(html.includes(">语言/Language</span>"), true);
  assertEquals(
    html.includes(
      'href="/login?locale=zh-CN&amp;returnTo=%2F&amp;localeChanged=1"',
    ),
    true,
  );
  assertEquals(
    html.includes(
      'href="/login?locale=en-US&amp;returnTo=%2F&amp;localeChanged=1"',
    ),
    true,
  );
  assertEquals(html.includes("/settings"), false);
  assertEquals(html.includes("/history"), false);
  assertEquals(html.includes('href="/"'), false);
});

Deno.test("auth routes preserve explicit locale selection in auth links", async () => {
  const app = createTestApp();

  const response = await app.request(
    "/login?locale=en-US&localeChanged=1&returnTo=%2Fsettings",
  );
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(
    html.includes('action="/login?locale=en-US&amp;localeChanged=1"'),
    true,
  );
  assertEquals(
    html.includes(
      'href="/register?locale=en-US&amp;returnTo=%2Fsettings&amp;localeChanged=1"',
    ),
    true,
  );
});

Deno.test("auth routes select anonymous page locale from browser language", async () => {
  const app = createTestApp();

  const response = await app.request("/register", {
    headers: { "accept-language": "en-CA,en;q=0.8,zh-CN;q=0.5" },
  });
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(html.includes('lang="en-CA"'), true);
  assertEquals(html.includes("Register"), true);
  assertEquals(html.includes("Confirm password"), true);
});

Deno.test("auth routes register users with hashed passwords and a session cookie", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  const form = new URLSearchParams({
    confirmPassword: "correct-password",
    password: "correct-password",
    returnTo: "/settings",
    username: "Alice",
  });

  const response = await app.request("/register", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const account = await storage.getAccountByUsername("alice");
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );
  const credential = storage.passwordCredentialsByUserId.get(account?.id ?? "");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings");
  assertEquals(account?.username, "alice");
  assertEquals(account?.passwordHash === "correct-password", false);
  assertEquals(credential?.passwordHash, account?.passwordHash);
  assertEquals(session?.userId, account?.id);
  assertEquals(storage.savedSessions.length, 1);
  assertEquals(
    response.headers.get("set-cookie")?.includes(
      storage.savedSessions[0].tokenHash,
    ),
    false,
  );
});

Deno.test("auth routes reject registration without Turnstile token when enabled", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, turnstileAuthOptions());

  const response = await app.request("/register", {
    body: testCsrfForm(
      new URLSearchParams({
        confirmPassword: "correct-password",
        password: "correct-password",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/register?locale=zh-CN&error=humanVerification",
  );
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
});

Deno.test("auth routes register users after Turnstile verification", async () => {
  const storage = createMemoryStorage();
  let requestBody = "";
  const app = createTestApp(
    storage,
    turnstileAuthOptions({
      fetcher: async (_input, init) => {
        requestBody = await requestText(init?.body);
        return new Response(JSON.stringify({ success: true }));
      },
    }),
  );
  const form = new URLSearchParams({
    confirmPassword: "correct-password",
    password: "correct-password",
    username: "alice",
    [turnstileResponseFieldName]: "verified-token",
  });

  const response = await app.request("/register", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(
    (await storage.getAccountByUsername("alice"))?.username,
    "alice",
  );
  assertEquals(requestBody.includes("response=verified-token"), true);
});

Deno.test("auth routes save selected registration locale in user settings", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  const form = new URLSearchParams({
    confirmPassword: "correct-password",
    password: "correct-password",
    username: "Alice",
  });

  const response = await app.request("/register?locale=en-US&localeChanged=1", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  const settings = await storage.forUser(account.id).getSettings();

  assertEquals(response.status, 303);
  assertEquals(settings.locale, "en-US");
});

Deno.test("auth routes reject duplicate registrations", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");

  const response = await register(app, "alice", "another-password");

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/register?locale=zh-CN&error=exists",
  );
});

Deno.test("auth routes reject registrations with mismatched passwords", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);

  const response = await register(
    app,
    "alice",
    "correct-password",
    "different-password",
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/register?locale=zh-CN&error=confirmPassword",
  );
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
});

Deno.test("auth routes reject registration without a valid CSRF token", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);

  const response = await app.request("/register", {
    body: new URLSearchParams({
      confirmPassword: "correct-password",
      password: "correct-password",
      username: "alice",
    }),
    method: "POST",
  });

  assertEquals(response.status, 403);
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
});

Deno.test("auth routes rate limit registration attempts by client", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  const headers = testCsrfHeaders({ "x-forwarded-for": "203.0.113.10" });

  for (let index = 0; index < 5; index += 1) {
    const response = await app.request("/register", {
      body: testCsrfForm(
        new URLSearchParams({
          confirmPassword: "correct-password",
          password: "correct-password",
          username: `user-${index}`,
        }),
      ),
      headers,
      method: "POST",
    });
    assertEquals(response.status, 303);
  }

  const limitedResponse = await app.request("/register", {
    body: testCsrfForm(
      new URLSearchParams({
        confirmPassword: "correct-password",
        password: "correct-password",
        username: "too-many",
      }),
    ),
    headers,
    method: "POST",
  });

  assertEquals(limitedResponse.status, 429);
  assertEquals(limitedResponse.headers.get("retry-after") !== null, true);
  assertEquals(await storage.getAccountByUsername("too-many"), undefined);
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
    ["/", "/register?locale=zh-CN&error=exists"],
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

  const response = await app.request("/login", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/history");
  assertEquals(session?.username, "alice");
});

Deno.test("auth routes migrate legacy password credentials after login", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  const account: UserAccount = {
    createdAt: "2026-07-31T00:00:00.000Z",
    id: "legacy-user-id",
    username: "alice",
    ...(await hashPassword("correct-password")),
  };
  await storage.createAccount(account);

  const response = await login(app, "alice", "correct-password");
  const credential = storage.passwordCredentialsByUserId.get(account.id);

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(credential?.passwordHash, account.passwordHash);
  assertEquals(credential?.userId, account.id);
});

Deno.test("auth routes preserve explicit locale selection across login errors", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");

  const response = await app.request("/login?locale=en-US&localeChanged=1", {
    body: testCsrfForm(
      new URLSearchParams({
        password: "incorrect-password",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/login?locale=en-US&error=invalid&returnTo=%2F&localeChanged=1",
  );
});

Deno.test("auth routes sync selected login locale into user settings", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  await storage.forUser(account.id).saveSettings({
    ...defaultSettings,
    locale: "zh-CN",
    themeColor: "#112233",
  });
  const form = new URLSearchParams({
    password: "correct-password",
    username: "alice",
  });

  const response = await app.request("/login?locale=en-US&localeChanged=1", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const settings = await storage.forUser(account.id).getSettings();

  assertEquals(response.status, 303);
  assertEquals(settings.locale, "en-US");
  assertEquals(settings.themeColor, "#112233");
});

Deno.test("auth routes keep saved locale without explicit login locale change", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  await storage.forUser(account.id).saveSettings({
    ...defaultSettings,
    locale: "zh-CN",
  });
  const form = new URLSearchParams({
    password: "correct-password",
    username: "alice",
  });

  const response = await app.request("/login?locale=en-US", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const settings = await storage.forUser(account.id).getSettings();

  assertEquals(response.status, 303);
  assertEquals(settings.locale, "zh-CN");
});

Deno.test("auth routes lock repeated failed login attempts", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage);
  await register(app, "alice", "correct-password");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await login(app, "alice", "incorrect-password");
    assertEquals(
      response.headers.get("location"),
      "/login?locale=zh-CN&error=invalid&returnTo=%2F",
    );
  }

  const lockedResponse = await login(app, "alice", "incorrect-password");
  const blockedCorrectPasswordResponse = await login(
    app,
    "alice",
    "correct-password",
  );

  assertEquals(
    lockedResponse.headers.get("location"),
    "/login?locale=zh-CN&error=rateLimited&returnTo=%2F",
  );
  assertEquals(
    blockedCorrectPasswordResponse.headers.get("location"),
    "/login?locale=zh-CN&error=rateLimited&returnTo=%2F",
  );
});

Deno.test("auth routes require Turnstile after repeated login failures", async () => {
  const storage = createMemoryStorage();
  let turnstileRequests = 0;
  const app = createTestApp(
    storage,
    turnstileAuthOptions({
      fetcher: () => {
        turnstileRequests += 1;
        return Promise.resolve(new Response(JSON.stringify({ success: true })));
      },
    }),
  );
  const account: UserAccount = {
    createdAt: "2026-07-31T00:00:00.000Z",
    id: "alice-id",
    username: "alice",
    ...(await hashPassword("correct-password")),
  };
  await storage.createAccount(account);

  await login(app, "alice", "incorrect-password");
  const challengedFailure = await login(app, "alice", "incorrect-password");
  const challengedWithoutToken = await login(app, "alice", "correct-password");
  const verifiedForm = new URLSearchParams({
    password: "correct-password",
    username: "alice",
    [turnstileResponseFieldName]: "verified-token",
  });
  const verifiedResponse = await app.request("/login", {
    body: testCsrfForm(verifiedForm),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(
    challengedFailure.headers.get("location"),
    "/login?locale=zh-CN&error=invalid&returnTo=%2F&turnstile=1",
  );
  assertEquals(
    challengedWithoutToken.headers.get("location"),
    "/login?locale=zh-CN&error=humanVerification&returnTo=%2F&turnstile=1",
  );
  assertEquals(verifiedResponse.headers.get("location"), "/");
  assertEquals(turnstileRequests, 1);
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
function createTestApp(
  storage = createMemoryStorage(),
  options: AuthOptions = {},
): Hono {
  const app = new Hono();
  app.route("/", createAuthRoutes(storage, options));
  app.get("/healthz", (c) => c.text("ok"));
  app.use("*", createAuthMiddleware(storage, options));
  app.get("/settings", (c) => c.text("settings"));
  return app;
}

/**
 * 创建开启 Turnstile 的认证测试配置。
 *
 * @param options Turnstile 测试选项。
 * @return 认证测试配置。
 */
function turnstileAuthOptions(options: {
  fetcher?: AuthOptions["turnstileFetch"];
} = {}): AuthOptions {
  return {
    turnstile: {
      enabled: true,
      secretKey: "test-secret-key",
      siteKey: "test-site-key",
    },
    turnstileFetch: options.fetcher,
  };
}

/**
 * 读取测试 fetch 请求体文本。
 *
 * @param body 请求体。
 * @return 请求体文本。
 */
async function requestText(body: BodyInit | null | undefined): Promise<string> {
  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof FormData) {
    return new URLSearchParams(
      Array.from(body.entries()).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : []
      ),
    ).toString();
  }

  if (body instanceof Blob) {
    return await body.text();
  }

  return "";
}

/**
 * 创建认证测试使用的内存存储。
 *
 * @return 带会话记录能力的内存存储。
 */
function createMemoryStorage(): ReturnType<typeof createKvStorage> & {
  passwordCredentialsByUserId: Map<string, PasswordCredential>;
  savedSessions: UserSession[];
  settingsByUserId: Map<string, AppSettings>;
} {
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
  const loginFailuresByUsername = new Map<
    string,
    { failures: number; lockedUntil?: string }
  >();
  const passwordCredentialsByUserId = new Map<string, PasswordCredential>();
  const settingsByUserId = new Map<string, AppSettings>();
  const sessionsByTokenHash = new Map<string, UserSession>();
  const savedSessions: UserSession[] = [];

  return {
    ...createMemoryRateLimitRecorder(),
    passwordCredentialsByUserId,
    savedSessions,
    settingsByUserId,
    /**
     * 创建指定测试用户作用域的设置存储。
     *
     * @param userId 用户 ID。
     * @return 测试用户作用域存储。
     */
    forUser: (userId: string) =>
      ({
        /**
         * 获取测试用户设置。
         *
         * @return 测试用户应用设置。
         */
        getSettings: () =>
          Promise.resolve(
            cloneSettings(settingsByUserId.get(userId) ?? defaultSettings),
          ),
        /**
         * 保存测试用户设置。
         *
         * @param settings 应用设置。
         * @return 保存完成后的 Promise。
         */
        saveSettings: (settings: AppSettings) => {
          settingsByUserId.set(userId, cloneSettings(settings));
          return Promise.resolve();
        },
      }) as ReturnType<ReturnType<typeof createKvStorage>["forUser"]>,
    getAccountById: (id: string) => Promise.resolve(accountsById.get(id)),
    getAccountByUsername: (username: string) => {
      const id = accountIdsByUsername.get(username.trim().toLowerCase());
      return Promise.resolve(id ? accountsById.get(id) : undefined);
    },
    listAccounts: () => Promise.resolve(Array.from(accountsById.values())),
    saveAccount: (account: UserAccount) => {
      accountsById.set(account.id, account);
      accountIdsByUsername.set(
        account.username.trim().toLowerCase(),
        account.id,
      );
      return Promise.resolve();
    },
    createAccount: (account: UserAccount) =>
      Promise.resolve(
        addUniqueAccount(accountsById, accountIdsByUsername, account),
      ),
    getPasswordCredential: (userId: string) =>
      Promise.resolve(passwordCredentialsByUserId.get(userId)),
    savePasswordCredential: (credential: PasswordCredential) => {
      passwordCredentialsByUserId.set(credential.userId, credential);
      return Promise.resolve();
    },
    getLoginFailure: (username: string) =>
      Promise.resolve(
        loginFailuresByUsername.get(username.trim().toLowerCase()),
      ),
    recordLoginFailure: (
      username: string,
      maxFailures: number,
      lockoutMs: number,
    ) => {
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
    getSession: (tokenHash: string) =>
      Promise.resolve(sessionsByTokenHash.get(tokenHash)),
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
  } as unknown as ReturnType<typeof createKvStorage> & {
    passwordCredentialsByUserId: Map<string, PasswordCredential>;
    savedSessions: UserSession[];
    settingsByUserId: Map<string, AppSettings>;
  };
}

/**
 * 克隆应用设置，避免测试存储中的对象被外部引用改写。
 *
 * @param settings 待克隆的应用设置。
 * @return 克隆后的应用设置。
 */
function cloneSettings(settings: AppSettings): AppSettings {
  return structuredClone(settings);
}

/**
 * 认证测试使用的默认应用设置。
 */
const defaultSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "",
  notificationEmailApiToken: "",
  notificationEmailApiUrl: "",
  notificationEmailFrom: "",
  notificationEmailService: "smtp",
  notificationProvider: "disabled",
  notificationPushPlusToken: "",
  notificationServerChanSendKey: "",
  notificationSmtpHost: "",
  notificationSmtpPassword: "",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "",
  notificationWxPusherSpt: "",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
    postLimit: 20,
    sort: "replyTime",
  },
  themeColor: "#bd7fff",
  topics: [],
};
