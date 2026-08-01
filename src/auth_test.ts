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
import {
  createEmailVerificationChallenge,
  type EmailVerificationEmailMessage,
} from "./auth/email_verification.ts";
import {
  createTotpSecretMaterial,
  decryptTotpSecret,
  generateTotpCode,
} from "./auth/totp.ts";
import type {
  AppSettings,
  AuthIdentity,
  EmailCredential,
  PasswordCredential,
  PendingEmailVerification,
  PendingMfaChallenge,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
  UserSession,
} from "./models.ts";
import { base64UrlEncode } from "./security/crypto_utils.ts";
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

/**
 * 邮箱验证码测试使用的固定配置。
 */
const testEmailVerificationConfig = {
  codeSecret: "test-email-code-secret",
  codeTtlSeconds: 600,
  maxAttempts: 5,
};

/**
 * 验证器动态码测试使用的固定配置。
 */
const testTotpConfig = {
  digits: 6,
  issuer: "Test",
  periodSeconds: 30,
  secretBytes: 20,
  secretEncryptionKey: "test-totp-encryption-key",
  verificationWindow: 1,
};

/**
 * Google 登录测试使用的固定 client ID。
 */
const testGoogleClientId = "test-client-id.apps.googleusercontent.com";

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
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(html.includes("登录"), true);
  assertEquals(html.includes("邮箱验证码登录"), true);
  assertEquals(html.includes("data-auth-email-login-form"), true);
  assertEquals(html.includes("data-auth-email-send-code-button"), true);
  assertEquals(html.includes('name="authMethod" value="email"'), true);
  assertEquals(html.includes("https://accounts.google.com/gsi/client"), false);
  assertEquals(html.includes("data-google-login"), false);
});

Deno.test("auth routes render Google Identity Services when configured", async () => {
  const app = createTestApp(
    createMemoryStorage(),
    googleAuthOptions({ keys: [] }),
  );

  const response = await app.request(
    "/login?locale=en-US&localeChanged=1&returnTo=%2Fsettings",
  );
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(
    html.includes("https://accounts.google.com/gsi/client"),
    true,
  );
  assertEquals(html.includes("data-google-login"), true);
  assertEquals(
    html.includes(`data-google-client-id="${testGoogleClientId}"`),
    true,
  );
  assertEquals(
    html.includes('action="/auth/google?locale=en-US&amp;localeChanged=1"'),
    true,
  );
  assertEquals(html.includes('name="credential" data-google-credential'), true);
  assertEquals(html.includes("use_fedcm_for_prompt: true"), true);
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

Deno.test("auth routes send email verification codes", async () => {
  const storage = createMemoryStorage();
  const sentMessages: EmailVerificationEmailMessage[] = [];
  const app = createTestApp(
    storage,
    emailVerificationAuthOptions({
      sender: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    }),
  );

  const response = await app.request("/auth/email-verifications?locale=en-US", {
    body: testCsrfForm(
      new URLSearchParams({
        email: " Alice@Example.COM ",
        purpose: "primary_login",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const payload = await response.json();
  const verification = Array.from(
    storage.pendingEmailVerificationsById.values(),
  )[0];
  const sentCode = sentMessages[0].text.match(/[0-9]{6}/)?.[0] ?? "";

  assertEquals(response.status, 200);
  assertEquals(payload.ok, true);
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].to, "alice@example.com");
  assertEquals(verification.email, "alice@example.com");
  assertEquals(verification.purpose, "primary_login");
  assertEquals(verification.codeHash === sentCode, false);
});

Deno.test("auth routes reject email verification without Turnstile token when enabled", async () => {
  const storage = createMemoryStorage();
  const sentMessages: EmailVerificationEmailMessage[] = [];
  const app = createTestApp(storage, {
    ...emailVerificationAuthOptions({
      sender: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    }),
    ...turnstileAuthOptions(),
  });

  const response = await app.request("/auth/email-verifications", {
    body: testCsrfForm(
      new URLSearchParams({
        email: "alice@example.com",
        purpose: "primary_login",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 403);
  assertEquals((await response.json()).error, "humanVerification");
  assertEquals(sentMessages.length, 0);
  assertEquals(storage.pendingEmailVerificationsById.size, 0);
});

Deno.test("auth routes rate limit email verification by target and purpose", async () => {
  const storage = createMemoryStorage();
  const sentMessages: EmailVerificationEmailMessage[] = [];
  const app = createTestApp(
    storage,
    emailVerificationAuthOptions({
      sender: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    }),
  );
  const headers = testCsrfHeaders({ "x-forwarded-for": "203.0.113.20" });

  for (let index = 0; index < 3; index += 1) {
    const response = await app.request("/auth/email-verifications", {
      body: testCsrfForm(
        new URLSearchParams({
          email: "alice@example.com",
          purpose: "primary_login",
        }),
      ),
      headers,
      method: "POST",
    });
    assertEquals(response.status, 200);
  }

  const limitedResponse = await app.request("/auth/email-verifications", {
    body: testCsrfForm(
      new URLSearchParams({
        email: "alice@example.com",
        purpose: "primary_login",
      }),
    ),
    headers,
    method: "POST",
  });

  assertEquals(limitedResponse.status, 429);
  assertEquals(sentMessages.length, 3);
});

Deno.test("auth routes sign in with email verification and create a passwordless account", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, emailVerificationAuthOptions());
  const challenge = await createEmailVerificationChallenge({
    code: "123456",
    config: testEmailVerificationConfig,
    email: " Alice@Example.COM ",
    id: "email-login-verification",
    purpose: "primary_login",
  });
  await storage.savePendingEmailVerification(challenge.verification);

  const response = await app.request("/login?locale=en-US&localeChanged=1", {
    body: testCsrfForm(
      new URLSearchParams({
        authMethod: "email",
        code: "123456",
        email: "Alice@Example.COM",
        returnTo: "/",
        verificationId: "email-login-verification",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const account = await storage.getAccountByUsername("alice");
  const credential = account
    ? await storage.getEmailCredential(account.id, "alice@example.com")
    : undefined;

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(account?.primaryEmail, "alice@example.com");
  assertEquals(account?.emailVerified, true);
  assertEquals(account?.passwordHash, undefined);
  assertEquals(credential?.verified, true);
  assertEquals(credential?.lastVerifiedAt !== undefined, true);
  assertEquals(storage.savedSessions[0]?.userId, account?.id);
  assertEquals(
    storage.settingsByUserId.get(account?.id ?? "")?.locale,
    "en-US",
  );
  assertEquals(
    await storage.getPendingEmailVerification("email-login-verification"),
    undefined,
  );
});

Deno.test("auth routes sign in with Google credential and create a passwordless account", async () => {
  const storage = createMemoryStorage();
  const fixture = await googleTokenFixture();
  const app = createTestApp(storage, googleAuthOptions(fixture.jwks));

  const response = await app.request(
    "/auth/google?locale=en-US&localeChanged=1",
    {
      body: testCsrfForm(
        new URLSearchParams({
          credential: fixture.token,
          returnTo: "/history",
        }),
      ),
      headers: testCsrfHeaders(),
      method: "POST",
    },
  );
  const identity = await storage.getAuthIdentity(
    "google",
    "google-subject-id",
  );
  const account = identity
    ? await storage.getAccountById(identity.userId)
    : undefined;
  const emailCredential = account
    ? await storage.getEmailCredential(account.id, "alice@example.com")
    : undefined;
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/history");
  assertEquals(identity?.provider, "google");
  assertEquals(identity?.providerUserId, "google-subject-id");
  assertEquals(identity?.email, "alice@example.com");
  assertEquals(identity?.emailVerified, true);
  assertEquals(account?.authVersion, 2);
  assertEquals(account?.displayName, "Alice");
  assertEquals(account?.primaryEmail, "alice@example.com");
  assertEquals(account?.emailVerified, true);
  assertEquals(account?.passwordHash, undefined);
  assertEquals(emailCredential?.verified, true);
  assertEquals(emailCredential?.lastVerifiedAt !== undefined, true);
  assertEquals(session?.userId, account?.id);
  assertEquals(storage.savedSessions[0]?.userId, account?.id);
  assertEquals(
    storage.settingsByUserId.get(account?.id ?? "")?.locale,
    "en-US",
  );
});

Deno.test("auth routes do not merge Google sign-in into an existing same-email account", async () => {
  const storage = createMemoryStorage();
  const fixture = await googleTokenFixture();
  const existingAccount: UserAccount = {
    authVersion: 2,
    createdAt: "2026-07-31T00:00:00.000Z",
    emailVerified: true,
    id: "existing-user-id",
    primaryEmail: "alice@example.com",
    username: "alice",
  };
  await storage.createAccount(existingAccount);
  await storage.saveEmailCredential({
    createdAt: "2026-07-31T00:00:00.000Z",
    email: "alice@example.com",
    lastVerifiedAt: "2026-07-31T00:00:00.000Z",
    userId: existingAccount.id,
    verified: true,
  });
  const app = createTestApp(storage, googleAuthOptions(fixture.jwks));

  const response = await app.request("/auth/google", {
    body: testCsrfForm(
      new URLSearchParams({
        credential: fixture.token,
        returnTo: "/",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const identity = await storage.getAuthIdentity(
    "google",
    "google-subject-id",
  );
  const accounts = await storage.listAccounts();

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(accounts.length, 2);
  assertEquals(identity?.userId === existingAccount.id, false);
  assertEquals(storage.savedSessions[0]?.userId, identity?.userId);
  assertEquals(
    (await storage.getAccountById(existingAccount.id))?.primaryEmail,
    "alice@example.com",
  );
});

Deno.test("auth routes reject invalid Google credentials", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, googleAuthOptions({ keys: [] }));

  const response = await app.request("/auth/google", {
    body: testCsrfForm(
      new URLSearchParams({
        credential: "not-a-google-id-token",
        returnTo: "/settings",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/login?locale=zh-CN&error=google&returnTo=%2Fsettings",
  );
  assertEquals((await storage.listAccounts()).length, 0);
  assertEquals(storage.savedSessions.length, 0);
});

Deno.test("auth routes reject email login with an incorrect code", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, emailVerificationAuthOptions());
  const challenge = await createEmailVerificationChallenge({
    code: "123456",
    config: testEmailVerificationConfig,
    email: "alice@example.com",
    id: "email-login-wrong-code",
    purpose: "primary_login",
  });
  await storage.savePendingEmailVerification(challenge.verification);

  const response = await app.request("/login", {
    body: testCsrfForm(
      new URLSearchParams({
        authMethod: "email",
        code: "000000",
        email: "alice@example.com",
        returnTo: "/",
        verificationId: "email-login-wrong-code",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const pending = await storage.getPendingEmailVerification(
    "email-login-wrong-code",
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/login?locale=zh-CN&error=emailCode&returnTo=%2F",
  );
  assertEquals(pending?.attempts, 1);
  assertEquals((await storage.listAccounts()).length, 0);
  assertEquals(storage.savedSessions.length, 0);
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

Deno.test("auth routes require MFA after password login when enabled", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, emailVerificationAuthOptions());
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  await enableEmailSecondFactor(storage, account.id);

  const response = await app.request("/login", {
    body: testCsrfForm(
      new URLSearchParams({
        password: "correct-password",
        returnTo: "/history",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const location = response.headers.get("location") ?? "";
  const challengeId = mfaChallengeIdFromLocation(location);
  const challenge = await storage.getPendingMfaChallenge(challengeId);
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );
  const pageResponse = await app.request(location);
  const pageHtml = await pageResponse.text();

  assertEquals(response.status, 303);
  assertEquals(location.startsWith("/mfa?locale=zh-CN&challenge="), true);
  assertEquals(
    new URL(location, "http://local").searchParams.get("returnTo"),
    "/history",
  );
  assertEquals(session, undefined);
  assertEquals(challenge?.userId, account.id);
  assertEquals(challenge?.primaryMethod, "password");
  assertEquals(challenge?.allowedMethods, ["email"]);
  assertEquals(pageResponse.status, 200);
  assertEquals(pageHtml.includes("data-mfa-email-form"), true);
  assertEquals(pageHtml.includes('data-mfa-method="email"'), true);
  assertEquals(pageHtml.includes("双重验证"), true);
});

Deno.test("auth routes complete email MFA and create a session", async () => {
  const storage = createMemoryStorage();
  const sentMessages: EmailVerificationEmailMessage[] = [];
  const app = createTestApp(
    storage,
    emailVerificationAuthOptions({
      sender: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    }),
  );
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  await enableEmailSecondFactor(storage, account.id);

  const loginResponse = await app.request("/login", {
    body: testCsrfForm(
      new URLSearchParams({
        password: "correct-password",
        returnTo: "/history",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const challengeId = mfaChallengeIdFromLocation(
    loginResponse.headers.get("location"),
  );
  const codeResponse = await app.request("/auth/email-verifications", {
    body: testCsrfForm(
      new URLSearchParams({
        challengeId,
        email: "alice@example.com",
        purpose: "second_factor",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const codePayload = await codeResponse.json();
  const sentCode = sentMessages[0].text.match(/[0-9]{6}/)?.[0] ?? "";
  const response = await app.request("/mfa", {
    body: testCsrfForm(
      new URLSearchParams({
        challengeId,
        code: sentCode,
        email: "alice@example.com",
        method: "email",
        returnTo: "/history",
        verificationId: String(codePayload.id),
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );

  assertEquals(codeResponse.status, 200);
  assertEquals(codePayload.ok, true);
  assertEquals(sentMessages.length, 1);
  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/history");
  assertEquals(session?.username, "alice");
  assertEquals(await storage.getPendingMfaChallenge(challengeId), undefined);
  assertEquals(
    await storage.getPendingEmailVerification(String(codePayload.id)),
    undefined,
  );
});

Deno.test("auth routes complete TOTP MFA and create a session", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, totpAuthOptions());
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  const material = await enableTotpSecondFactor(storage, account.id);

  const loginResponse = await app.request("/login", {
    body: testCsrfForm(
      new URLSearchParams({
        password: "correct-password",
        returnTo: "/history",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const location = loginResponse.headers.get("location") ?? "";
  const challengeId = mfaChallengeIdFromLocation(location);
  const pageResponse = await app.request(location);
  const pageHtml = await pageResponse.text();
  const secret = await decryptTotpSecret(
    material.secretEncrypted,
    testTotpConfig.secretEncryptionKey,
  );
  const code = await generateTotpCode(secret, testTotpConfig);

  const response = await app.request("/mfa", {
    body: testCsrfForm(
      new URLSearchParams({
        challengeId,
        code,
        method: "totp",
        returnTo: "/history",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );

  assertEquals(loginResponse.status, 303);
  assertEquals(pageResponse.status, 200);
  assertEquals(pageHtml.includes("data-mfa-totp-form"), true);
  assertEquals(pageHtml.includes('data-mfa-method="totp"'), true);
  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/history");
  assertEquals(session?.username, "alice");
  assertEquals(await storage.getPendingMfaChallenge(challengeId), undefined);
});

Deno.test("auth routes reject incorrect TOTP MFA codes", async () => {
  const storage = createMemoryStorage();
  const app = createTestApp(storage, totpAuthOptions());
  await register(app, "alice", "correct-password");
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("测试账号创建失败。");
  }
  const material = await enableTotpSecondFactor(storage, account.id);

  const loginResponse = await app.request("/login", {
    body: testCsrfForm(
      new URLSearchParams({
        password: "correct-password",
        username: "alice",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const challengeId = mfaChallengeIdFromLocation(
    loginResponse.headers.get("location"),
  );
  const secret = await decryptTotpSecret(
    material.secretEncrypted,
    testTotpConfig.secretEncryptionKey,
  );
  const currentCode = await generateTotpCode(secret, testTotpConfig);
  const wrongCode = currentCode === "000000" ? "111111" : "000000";

  const response = await app.request("/mfa", {
    body: testCsrfForm(
      new URLSearchParams({
        challengeId,
        code: wrongCode,
        method: "totp",
        returnTo: "/",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const challenge = await storage.getPendingMfaChallenge(challengeId);
  const session = await readAuthSession(
    response.headers.get("set-cookie") ?? "",
    storage,
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location")?.startsWith(
      `/mfa?locale=zh-CN&challenge=${challengeId}`,
    ),
    true,
  );
  assertEquals(challenge?.attempts, 1);
  assertEquals(session, undefined);
});

Deno.test("auth routes reject second-factor email codes without MFA challenge", async () => {
  const storage = createMemoryStorage();
  const sentMessages: EmailVerificationEmailMessage[] = [];
  const app = createTestApp(
    storage,
    emailVerificationAuthOptions({
      sender: (message) => {
        sentMessages.push(message);
        return Promise.resolve();
      },
    }),
  );

  const response = await app.request("/auth/email-verifications", {
    body: testCsrfForm(
      new URLSearchParams({
        challengeId: "missing-challenge",
        email: "alice@example.com",
        purpose: "second_factor",
      }),
    ),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 400);
  assertEquals((await response.json()).error, "mfaChallengeInvalid");
  assertEquals(sentMessages.length, 0);
  assertEquals(storage.pendingEmailVerificationsById.size, 0);
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
 * 创建开启邮箱验证码的认证测试配置。
 *
 * @param options 邮箱验证码测试选项。
 * @return 认证测试配置。
 */
function emailVerificationAuthOptions(options: {
  sender?: AuthOptions["sendEmailVerificationEmail"];
} = {}): AuthOptions {
  return {
    emailVerification: testEmailVerificationConfig,
    sendEmailVerificationEmail: options.sender,
  };
}

/**
 * 创建开启验证器动态码的认证测试配置。
 *
 * @return 认证测试配置。
 */
function totpAuthOptions(): AuthOptions {
  return {
    totp: testTotpConfig,
  };
}

/**
 * 为测试账户启用邮箱二次验证。
 *
 * @param storage 测试存储。
 * @param userId 用户 ID。
 * @param email 已验证邮箱地址。
 * @return 保存完成后的 Promise。
 */
async function enableEmailSecondFactor(
  storage: ReturnType<typeof createMemoryStorage>,
  userId: string,
  email = "alice@example.com",
): Promise<void> {
  const now = new Date().toISOString();
  await storage.saveEmailCredential({
    createdAt: now,
    email,
    lastVerifiedAt: now,
    userId,
    verified: true,
  });
  await storage.saveUserSecuritySettings({
    preferredSecondFactor: "email",
    twoFactorEnabled: true,
    userId,
  });
}

/**
 * 为测试账户启用验证器动态码二次验证。
 *
 * @param storage 测试存储。
 * @param userId 用户 ID。
 * @return 已创建的 TOTP secret 材料。
 */
async function enableTotpSecondFactor(
  storage: ReturnType<typeof createMemoryStorage>,
  userId: string,
) {
  const material = await createTotpSecretMaterial(testTotpConfig);
  await storage.saveTotpCredential({
    enabledAt: new Date().toISOString(),
    recoveryCodeHashes: [],
    secretEncrypted: material.secretEncrypted,
    userId,
  });
  await storage.saveUserSecuritySettings({
    preferredSecondFactor: "totp",
    twoFactorEnabled: true,
    userId,
  });
  return material;
}

/**
 * 从 MFA 重定向地址中读取 challenge ID。
 *
 * @param location 重定向地址。
 * @return MFA challenge ID。
 */
function mfaChallengeIdFromLocation(location: string | null): string {
  const challengeId = new URL(location ?? "", "http://local").searchParams.get(
    "challenge",
  );
  if (!challengeId) {
    throw new Error("MFA challenge ID 缺失。");
  }
  return challengeId;
}

/**
 * 创建启用 Google 登录的认证测试配置。
 *
 * @param jwks Google JWKS 测试响应。
 * @return 认证测试配置。
 */
function googleAuthOptions(jwks: { keys: JsonWebKey[] }): AuthOptions {
  return {
    google: {
      clientId: testGoogleClientId,
      jwksUrl: "https://keys.example.test/jwks",
    },
    googleJwksFetch: () => Promise.resolve(jsonResponse(jwks)),
  };
}

/**
 * Google token 测试夹具。
 */
type GoogleTokenFixture = {
  jwks: { keys: JsonWebKey[] };
  payload: Record<string, unknown>;
  token: string;
};

/**
 * 创建签名后的 Google ID token 测试夹具。
 *
 * @param payloadOverrides payload 覆盖项。
 * @return Google token 测试夹具。
 */
async function googleTokenFixture(
  payloadOverrides: Record<string, unknown> = {},
): Promise<GoogleTokenFixture> {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const jwk = {
    ...publicJwk,
    alg: "RS256",
    kid: "test-key-id",
    use: "sig",
  };
  const header = { alg: "RS256", kid: "test-key-id", typ: "JWT" };
  const payload = {
    aud: testGoogleClientId,
    email: "Alice@Example.COM",
    email_verified: true,
    exp: 4_102_444_800,
    iat: 1_785_561_600,
    iss: "https://accounts.google.com",
    name: "Alice",
    picture: "https://example.com/avatar.png",
    sub: "google-subject-id",
    ...payloadOverrides,
  };
  const signingInput = `${encodeJwtJson(header)}.${encodeJwtJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return {
    jwks: { keys: [jwk] },
    payload,
    token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`,
  };
}

/**
 * 编码 JWT JSON 片段。
 *
 * @param value 待编码对象。
 * @return Base64URL 编码片段。
 */
function encodeJwtJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * 创建 JSON 响应。
 *
 * @param value 响应对象。
 * @return JSON 响应。
 */
function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
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
  authIdentitiesByKey: Map<string, AuthIdentity>;
  emailCredentialsByKey: Map<string, EmailCredential>;
  passwordCredentialsByUserId: Map<string, PasswordCredential>;
  pendingEmailVerificationsById: Map<string, PendingEmailVerification>;
  pendingMfaChallengesById: Map<string, PendingMfaChallenge>;
  savedSessions: UserSession[];
  securitySettingsByUserId: Map<string, UserSecuritySettings>;
  settingsByUserId: Map<string, AppSettings>;
  totpCredentialsByUserId: Map<string, TotpCredential>;
} {
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
  const authIdentitiesByKey = new Map<string, AuthIdentity>();
  const emailCredentialsByKey = new Map<string, EmailCredential>();
  const loginFailuresByUsername = new Map<
    string,
    { failures: number; lockedUntil?: string }
  >();
  const passwordCredentialsByUserId = new Map<string, PasswordCredential>();
  const pendingEmailVerificationsById = new Map<
    string,
    PendingEmailVerification
  >();
  const pendingMfaChallengesById = new Map<string, PendingMfaChallenge>();
  const securitySettingsByUserId = new Map<string, UserSecuritySettings>();
  const settingsByUserId = new Map<string, AppSettings>();
  const sessionsByTokenHash = new Map<string, UserSession>();
  const savedSessions: UserSession[] = [];
  const totpCredentialsByUserId = new Map<string, TotpCredential>();

  return {
    ...createMemoryRateLimitRecorder(),
    authIdentitiesByKey,
    emailCredentialsByKey,
    passwordCredentialsByUserId,
    pendingEmailVerificationsById,
    pendingMfaChallengesById,
    savedSessions,
    securitySettingsByUserId,
    settingsByUserId,
    totpCredentialsByUserId,
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
    updateAccount: (account: UserAccount) => {
      const currentAccount = accountsById.get(account.id);
      if (!currentAccount) {
        return Promise.resolve(false);
      }

      const currentUsername = currentAccount.username.trim().toLowerCase();
      const nextUsername = account.username.trim().toLowerCase();
      const existingUserId = accountIdsByUsername.get(nextUsername);
      if (existingUserId && existingUserId !== account.id) {
        return Promise.resolve(false);
      }

      accountsById.set(account.id, account);
      if (currentUsername !== nextUsername) {
        accountIdsByUsername.delete(currentUsername);
        accountIdsByUsername.set(nextUsername, account.id);
      }
      return Promise.resolve(true);
    },
    getAuthIdentity: (
      provider: AuthIdentity["provider"],
      providerUserId: string,
    ) =>
      Promise.resolve(
        authIdentitiesByKey.get(authIdentityKey(provider, providerUserId)),
      ),
    saveAuthIdentity: (identity: AuthIdentity) => {
      authIdentitiesByKey.set(
        authIdentityKey(identity.provider, identity.providerUserId),
        identity,
      );
      return Promise.resolve();
    },
    getEmailCredential: (userId: string, email: string) =>
      Promise.resolve(
        emailCredentialsByKey.get(emailCredentialKey(userId, email)),
      ),
    listEmailCredentials: (userId: string) =>
      Promise.resolve(
        Array.from(emailCredentialsByKey.values())
          .filter((credential) => credential.userId === userId)
          .toSorted((left, right) => left.email.localeCompare(right.email)),
      ),
    saveEmailCredential: (credential: EmailCredential) => {
      emailCredentialsByKey.set(
        emailCredentialKey(credential.userId, credential.email),
        credential,
      );
      return Promise.resolve();
    },
    deleteEmailCredential: (userId: string, email: string) => {
      emailCredentialsByKey.delete(emailCredentialKey(userId, email));
      return Promise.resolve();
    },
    getPasswordCredential: (userId: string) =>
      Promise.resolve(passwordCredentialsByUserId.get(userId)),
    savePasswordCredential: (credential: PasswordCredential) => {
      passwordCredentialsByUserId.set(credential.userId, credential);
      return Promise.resolve();
    },
    getTotpCredential: (userId: string) =>
      Promise.resolve(totpCredentialsByUserId.get(userId)),
    saveTotpCredential: (credential: TotpCredential) => {
      totpCredentialsByUserId.set(credential.userId, credential);
      return Promise.resolve();
    },
    deleteTotpCredential: (userId: string) => {
      totpCredentialsByUserId.delete(userId);
      return Promise.resolve();
    },
    getPendingEmailVerification: (id: string) =>
      Promise.resolve(pendingEmailVerificationsById.get(id)),
    savePendingEmailVerification: (verification: PendingEmailVerification) => {
      pendingEmailVerificationsById.set(verification.id, verification);
      return Promise.resolve();
    },
    deletePendingEmailVerification: (id: string) => {
      pendingEmailVerificationsById.delete(id);
      return Promise.resolve();
    },
    getPendingMfaChallenge: (id: string) =>
      Promise.resolve(pendingMfaChallengesById.get(id)),
    savePendingMfaChallenge: (challenge: PendingMfaChallenge) => {
      pendingMfaChallengesById.set(challenge.id, challenge);
      return Promise.resolve();
    },
    deletePendingMfaChallenge: (id: string) => {
      pendingMfaChallengesById.delete(id);
      return Promise.resolve();
    },
    getUserSecuritySettings: (userId: string) =>
      Promise.resolve(
        securitySettingsByUserId.get(userId) ?? {
          preferredSecondFactor: undefined,
          twoFactorEnabled: false,
          userId,
        },
      ),
    saveUserSecuritySettings: (settings: UserSecuritySettings) => {
      securitySettingsByUserId.set(settings.userId, settings);
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
    authIdentitiesByKey: Map<string, AuthIdentity>;
    emailCredentialsByKey: Map<string, EmailCredential>;
    passwordCredentialsByUserId: Map<string, PasswordCredential>;
    pendingEmailVerificationsById: Map<string, PendingEmailVerification>;
    pendingMfaChallengesById: Map<string, PendingMfaChallenge>;
    savedSessions: UserSession[];
    securitySettingsByUserId: Map<string, UserSecuritySettings>;
    settingsByUserId: Map<string, AppSettings>;
    totpCredentialsByUserId: Map<string, TotpCredential>;
  };
}

/**
 * 创建测试内存邮箱凭证键。
 *
 * @param userId 用户 ID。
 * @param email 邮箱地址。
 * @return 邮箱凭证键。
 */
function emailCredentialKey(userId: string, email: string): string {
  return `${userId}:${email.trim().toLowerCase()}`;
}

/**
 * 创建测试内存外部身份绑定键。
 *
 * @param provider 身份提供方。
 * @param providerUserId 提供方用户 ID。
 * @return 外部身份绑定键。
 */
function authIdentityKey(
  provider: AuthIdentity["provider"],
  providerUserId: string,
): string {
  return `${provider}:${providerUserId}`;
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
