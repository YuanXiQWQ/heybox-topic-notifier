/**
 * @file 本文件验证业务路由和设置表单解析逻辑。
 */
import { Hono } from "@hono/hono";
import { createRoutes, settingsFromForm } from "./routes.ts";
import { createAuthMiddleware, createAuthRoutes } from "./auth.ts";
import { createEmailVerificationChallenge } from "./auth/email_verification.ts";
import { decryptTotpSecret, generateTotpCode } from "./auth/totp.ts";
import type {
  AppSettings,
  EmailCredential,
  MatchRecord,
  PasswordCredential,
  PendingEmailVerification,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
  UserSession,
} from "./models.ts";
import type { AppContext } from "./services/app_context.ts";
import {
  NotificationConfigError,
  NotificationDeliveryError,
} from "./services/notifier.ts";
import {
  addUniqueAccount,
  assertEquals,
  createMemoryRateLimitRecorder,
  submitLogin as login,
  submitRegistration as register,
  testCsrfForm,
  testCsrfHeaders,
  testCsrfToken,
} from "./test_helpers.ts";

/**
 * 路由测试使用的当前应用设置。
 */
const currentSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [
    { keyword: "old-common", locations: ["title"] },
  ],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "old@example.com",
  notificationEmailApiToken: "old-api-token",
  notificationEmailApiUrl: "https://example.com/old-email-api",
  notificationEmailFrom: "old-from@example.com",
  notificationEmailService: "smtp",
  notificationProvider: "webhook",
  notificationPushPlusToken: "pushplus-current",
  notificationServerChanSendKey: "SCT-current",
  notificationSmtpHost: "smtp.current.example.com",
  notificationSmtpPassword: "smtp-current-password",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "smtp-current-user",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "https://example.com/webhook",
  notificationWxPusherSpt: "SPT-current",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
    postLimit: 20,
    sort: "publishTime",
  },
  themeColor: "#bd7fff",
  topics: [
    {
      enabled: true,
      id: "12099",
      keywordRules: [{ keyword: "old-topic", locations: ["comments"] }],
      note: "蔚蓝",
    },
    {
      enabled: true,
      id: "999",
      keywordRules: [{ keyword: "old-other", locations: ["body"] }],
      note: "其它",
    },
  ],
};

/**
 * 路由测试使用的邮箱验证码配置。
 */
const testEmailVerificationConfig = {
  codeSecret: "test-email-code-secret",
  codeTtlSeconds: 600,
  maxAttempts: 5,
};

/**
 * 路由测试使用的验证器动态码配置。
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
 * 账户相关路由测试使用的内存存储能力。
 */
type AccountRouteStorage = {
  clearLoginFailures(username: string): Promise<void>;
  createAccount(account: UserAccount): Promise<boolean>;
  deleteSession(tokenHash: string): Promise<void>;
  getAccountById(id: string): Promise<UserAccount | undefined>;
  getAccountByUsername(username: string): Promise<UserAccount | undefined>;
  getLoginFailure(username: string): Promise<undefined>;
  getEmailCredential(
    userId: string,
    email: string,
  ): Promise<EmailCredential | undefined>;
  getPendingEmailVerification(
    id: string,
  ): Promise<PendingEmailVerification | undefined>;
  getPasswordCredential(
    userId: string,
  ): Promise<PasswordCredential | undefined>;
  getSession(tokenHash: string): Promise<UserSession | undefined>;
  getSettings(): Promise<AppSettings>;
  getTotpCredential(userId: string): Promise<TotpCredential | undefined>;
  getUserSecuritySettings(userId: string): Promise<UserSecuritySettings>;
  listEmailCredentials(userId: string): Promise<EmailCredential[]>;
  recordLoginFailure(
    username: string,
    maxFailures: number,
    lockoutMs: number,
  ): Promise<{ failures: number }>;
  recordRateLimitHit: ReturnType<
    typeof createMemoryRateLimitRecorder
  >["recordRateLimitHit"];
  deletePendingEmailVerification(id: string): Promise<void>;
  saveEmailCredential(credential: EmailCredential): Promise<void>;
  savePendingEmailVerification(
    verification: PendingEmailVerification,
  ): Promise<void>;
  savePasswordCredential(credential: PasswordCredential): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveSession(session: UserSession): Promise<void>;
  saveTotpCredential(credential: TotpCredential): Promise<void>;
  saveUserSecuritySettings(settings: UserSecuritySettings): Promise<void>;
  deleteTotpCredential(userId: string): Promise<void>;
  updateAccount(account: UserAccount): Promise<boolean>;
};

Deno.test("health check returns deployment status without storage access", async () => {
  let ticks = 0;
  const app = createRoutes({
    scheduler: {
      tick: () => {
        ticks += 1;
        return Promise.resolve(true);
      },
    },
  } as unknown as AppContext);
  const response = await app.request("/healthz");
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.status, "ok");
  assertEquals(body.service, "heybox-topic-notifier");
  assertEquals(ticks, 0);
});

Deno.test("root page does not tick scheduler", async () => {
  let ticks = 0;
  const app = createRoutes({
    scheduler: {
      tick: () => {
        ticks += 1;
        return Promise.resolve(true);
      },
    },
    storage: {
      getDashboardSnapshot: () =>
        Promise.resolve({
          pendingMatches: [],
          settings: currentSettings,
          state: {
            totalMatches: 0,
          },
        }),
    },
  } as unknown as AppContext);

  const response = await app.request("/");

  assertEquals(response.status, 200);
  assertEquals(ticks, 0);
});

Deno.test("settingsFromForm preserves submitted inactive keyword groups", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "12099",
    commonKeywordRulesJson: JSON.stringify([{
      caseSensitive: true,
      keyword: "new-common",
      locations: ["body"],
      useRegex: true,
    }]),
    darkMode: "on",
    keyword_0: "new-topic",
    keyword_0_caseSensitive: "on",
    keyword_0_location_replies: "on",
    keyword_0_useRegex: "",
    locale: "zh-CN",
    notificationEmailAddress: "new@example.com",
    notificationEmailApiToken: "new-api-token",
    notificationEmailApiUrl: "https://example.com/new-email-api",
    notificationEmailFrom: "new-from@example.com",
    notificationEmailService: "api",
    notificationProvider: "email",
    notificationPushPlusSecret: "pushplus-new",
    notificationServerChanSendKey: "SCT-new",
    notificationSmtpHost: "smtp.new.example.com",
    notificationSmtpPassword: "smtp-new-password",
    notificationSmtpPort: "587",
    notificationSmtpSecure: "on",
    notificationSmtpUsername: "smtp-new-user",
    notificationWebhookService: "serverChan",
    notificationWebhookUrl: "https://example.com/new-webhook",
    notificationWxPusherSpt: "SPT-new",
    pollEnabled: "on",
    pollIntervalUnit: "second",
    pollIntervalValue: "3",
    pollPostLimit: "50",
    pollSort: "replyTime",
    themeColor: "#123abc",
    topic_0_enabled: "on",
    topic_0_id: "12099",
    topic_0_keywordRulesJson: JSON.stringify([{
      keyword: "stale-topic",
      locations: ["title"],
    }]),
    topic_0_note: "蔚蓝",
    topic_1_enabled: "on",
    topic_1_id: "999",
    topic_1_keywordRulesJson: JSON.stringify([{
      keyword: "new-other",
      locations: ["comments"],
      useRegex: true,
    }]),
    topic_1_note: "其它",
  }, currentSettings);

  assertEquals(settings.commonKeywordRules, [{
    caseSensitive: true,
    keyword: "new-common",
    locations: ["body"],
    useRegex: true,
  }]);
  assertEquals(settings.topics[0].keywordRules, [
    {
      caseSensitive: true,
      keyword: "new-topic",
      locations: ["replies"],
      useRegex: false,
    },
  ]);
  assertEquals(settings.topics[1].keywordRules, [
    {
      caseSensitive: false,
      keyword: "new-other",
      locations: ["comments"],
      useRegex: true,
    },
  ]);
  assertEquals(settings.darkMode, true);
  assertEquals(settings.notificationEmailAddress, "new@example.com");
  assertEquals(settings.notificationEmailApiToken, "new-api-token");
  assertEquals(
    settings.notificationEmailApiUrl,
    "https://example.com/new-email-api",
  );
  assertEquals(settings.notificationEmailFrom, "new-from@example.com");
  assertEquals(settings.notificationEmailService, "api");
  assertEquals(settings.notificationProvider, "email");
  assertEquals(settings.notificationPushPlusToken, "pushplus-new");
  assertEquals(settings.notificationServerChanSendKey, "SCT-new");
  assertEquals(settings.notificationSmtpHost, "smtp.new.example.com");
  assertEquals(settings.notificationSmtpPassword, "smtp-new-password");
  assertEquals(settings.notificationSmtpPort, 587);
  assertEquals(settings.notificationSmtpSecure, true);
  assertEquals(settings.notificationSmtpUsername, "smtp-new-user");
  assertEquals(settings.notificationWebhookService, "serverChan");
  assertEquals(
    settings.notificationWebhookUrl,
    "https://example.com/new-webhook",
  );
  assertEquals(settings.notificationWxPusherSpt, "SPT-new");
  assertEquals(settings.polling, {
    enabled: true,
    intervalUnit: "second",
    intervalValue: 3,
    postLimit: 50,
    sort: "replyTime",
  });
  assertEquals(settings.themeColor, "#123abc");
});

Deno.test("settingsFromForm disables polling when switch is off", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "common",
    pollIntervalUnit: "second",
    pollIntervalValue: "1",
    pollPostLimit: "100",
    pollSort: "smart",
  }, currentSettings);

  assertEquals(settings.polling, {
    enabled: false,
    intervalUnit: "second",
    intervalValue: 3,
    postLimit: 100,
    sort: "smart",
  });
});

Deno.test("settingsFromForm preserves existing notification secrets when submitted blank", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "common",
    notificationEmailApiToken: "",
    notificationPushPlusSecret: "",
    notificationServerChanSendKey: "   ",
    notificationSmtpPassword: "",
    notificationWebhookUrl: "",
    notificationWxPusherSpt: "",
  }, currentSettings);

  assertEquals(
    settings.notificationEmailApiToken,
    currentSettings.notificationEmailApiToken,
  );
  assertEquals(
    settings.notificationPushPlusToken,
    currentSettings.notificationPushPlusToken,
  );
  assertEquals(
    settings.notificationServerChanSendKey,
    currentSettings.notificationServerChanSendKey,
  );
  assertEquals(
    settings.notificationSmtpPassword,
    currentSettings.notificationSmtpPassword,
  );
  assertEquals(
    settings.notificationWebhookUrl,
    currentSettings.notificationWebhookUrl,
  );
  assertEquals(
    settings.notificationWxPusherSpt,
    currentSettings.notificationWxPusherSpt,
  );
});

Deno.test("settingsFromForm saves visible common keywords and submitted topic keywords", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "common",
    keyword_0: "visible-common",
    keyword_0_caseSensitive: "",
    keyword_0_location_title: "on",
    keyword_0_location_body: "on",
    keyword_0_useRegex: "on",
    locale: "zh-CN",
    notificationEmailAddress: "old@example.com",
    notificationProvider: "webhook",
    notificationPushPlusToken: "pushplus-current",
    notificationWebhookService: "custom",
    notificationWebhookUrl: "https://example.com/webhook",
    notificationWxPusherSpt: "SPT-current",
    themeColor: "#bd7fff",
    topic_0_enabled: "on",
    topic_0_id: "12099",
    topic_0_keywordRulesJson: JSON.stringify([{
      keyword: "submitted-topic",
      locations: ["title"],
    }]),
    topic_0_note: "蔚蓝",
  }, currentSettings);

  assertEquals(settings.commonKeywordRules, [
    {
      caseSensitive: false,
      keyword: "visible-common",
      locations: ["title", "body"],
      useRegex: true,
    },
  ]);
  assertEquals(settings.topics[0].keywordRules, [
    {
      caseSensitive: false,
      keyword: "submitted-topic",
      locations: ["title"],
      useRegex: false,
    },
  ]);
});

Deno.test("settingsFromForm falls back when inactive keyword JSON is malformed", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "12099",
    commonKeywordRulesJson: "not-json",
    keyword_0: "new-topic",
    keyword_0_location_title: "on",
    locale: "zh-CN",
    notificationEmailAddress: "old@example.com",
    notificationProvider: "webhook",
    notificationPushPlusToken: "pushplus-current",
    notificationWebhookService: "custom",
    notificationWebhookUrl: "https://example.com/webhook",
    notificationWxPusherSpt: "SPT-current",
    themeColor: "#bd7fff",
    topic_0_enabled: "on",
    topic_0_id: "12099",
    topic_0_note: "蔚蓝",
    topic_1_enabled: "on",
    topic_1_id: "999",
    topic_1_keywordRulesJson: "not-json",
    topic_1_note: "其它",
  }, currentSettings);

  assertEquals(settings.commonKeywordRules, currentSettings.commonKeywordRules);
  assertEquals(
    settings.topics[1].keywordRules,
    currentSettings.topics[1].keywordRules,
  );
});

Deno.test("settings route rejects saves without a valid CSRF token", async () => {
  let saved = false;
  const app = createRoutes({
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
      saveSettings: () => {
        saved = true;
        return Promise.resolve();
      },
    },
  } as unknown as AppContext);

  const response = await app.request("/settings", {
    body: new URLSearchParams({ themeColor: "#123abc" }),
    method: "POST",
  });

  assertEquals(response.status, 403);
  assertEquals(saved, false);
});

Deno.test("account route updates username for the signed-in user after password confirmation", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const form = new URLSearchParams({
    accountAction: "username",
    currentPassword: "correct-password",
    username: "YuanXi",
  });

  const response = await app.request("/account", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders({
      cookie: registerResponse.headers.get("set-cookie") ?? "",
    }),
    method: "POST",
  });
  const loginResponse = await login(app, "yuanxi", "correct-password");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?account=updated");
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
  assertEquals(
    (await storage.getAccountByUsername("yuanxi"))?.username,
    "yuanxi",
  );
  assertEquals(loginResponse.headers.get("location"), "/");
});

Deno.test("account route updates password for the signed-in user after password confirmation", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const form = new URLSearchParams({
    accountAction: "password",
    confirmPassword: "new-password",
    currentPassword: "correct-password",
    newPassword: "new-password",
  });

  const response = await app.request("/account", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders({
      cookie: registerResponse.headers.get("set-cookie") ?? "",
    }),
    method: "POST",
  });
  const loginResponse = await login(app, "alice", "new-password");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?account=updated");
  assertEquals(loginResponse.headers.get("location"), "/");
});

Deno.test("account route rejects duplicate usernames", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const aliceResponse = await register(app, "alice", "correct-password");
  await register(app, "bob", "correct-password");

  const response = await app.request("/account", {
    body: testCsrfForm(
      new URLSearchParams({
        accountAction: "username",
        currentPassword: "correct-password",
        username: "bob",
      }),
    ),
    headers: testCsrfHeaders({
      cookie: aliceResponse.headers.get("set-cookie") ?? "",
    }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?accountError=exists&accountMode=username",
  );
  assertEquals(
    (await storage.getAccountByUsername("alice"))?.id !== undefined,
    true,
  );
  assertEquals((await storage.getAccountByUsername("bob"))?.username, "bob");
});

Deno.test("account route rejects password changes without a valid current password", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");

  const response = await app.request("/account", {
    body: testCsrfForm(
      new URLSearchParams({
        accountAction: "password",
        confirmPassword: "new-password",
        currentPassword: "wrong-password",
        newPassword: "new-password",
      }),
    ),
    headers: testCsrfHeaders({
      cookie: registerResponse.headers.get("set-cookie") ?? "",
    }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?accountError=currentPassword&accountMode=password",
  );
});

Deno.test("account route rejects password changes that reuse the current password", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");

  const response = await app.request("/account", {
    body: testCsrfForm(
      new URLSearchParams({
        accountAction: "password",
        confirmPassword: "correct-password",
        currentPassword: "correct-password",
        newPassword: "correct-password",
      }),
    ),
    headers: testCsrfHeaders({
      cookie: registerResponse.headers.get("set-cookie") ?? "",
    }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?accountError=samePassword&accountMode=password",
  );
});

Deno.test("account password verification endpoint checks the signed-in user's password", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";

  const accepted = await app.request("/account/verify-password", {
    body: testCsrfForm(
      new URLSearchParams({ currentPassword: "correct-password" }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });
  const rejected = await app.request("/account/verify-password", {
    body: testCsrfForm(
      new URLSearchParams({ currentPassword: "wrong-password" }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(accepted.status, 204);
  assertEquals(rejected.status, 403);
});

Deno.test("account email route binds a verified email for the signed-in user", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const challenge = await createEmailVerificationChallenge({
    code: "123456",
    config: testEmailVerificationConfig,
    email: " Alice@Example.COM ",
    id: "email-binding-verification",
    purpose: "email_binding",
    userId: account.id,
  });
  await storage.savePendingEmailVerification(challenge.verification);

  const response = await app.request("/account/email/verify", {
    body: testCsrfForm(
      new URLSearchParams({
        code: "123456",
        email: "Alice@Example.COM",
        verificationId: "email-binding-verification",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });
  const updatedAccount = await storage.getAccountById(account.id);
  const credential = await storage.getEmailCredential(
    account.id,
    "alice@example.com",
  );

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?email=updated");
  assertEquals(updatedAccount?.primaryEmail, "alice@example.com");
  assertEquals(updatedAccount?.emailVerified, true);
  assertEquals(credential?.email, "alice@example.com");
  assertEquals(credential?.verified, true);
  assertEquals(credential?.lastVerifiedAt !== undefined, true);
  assertEquals(
    await storage.getPendingEmailVerification("email-binding-verification"),
    undefined,
  );
});

Deno.test("account email route rejects an incorrect verification code", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const challenge = await createEmailVerificationChallenge({
    code: "123456",
    config: testEmailVerificationConfig,
    email: "alice@example.com",
    id: "email-binding-wrong-code",
    purpose: "email_binding",
    userId: account.id,
  });
  await storage.savePendingEmailVerification(challenge.verification);

  const response = await app.request("/account/email/verify", {
    body: testCsrfForm(
      new URLSearchParams({
        code: "000000",
        email: "alice@example.com",
        verificationId: "email-binding-wrong-code",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });
  const pending = await storage.getPendingEmailVerification(
    "email-binding-wrong-code",
  );
  const updatedAccount = await storage.getAccountById(account.id);

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?emailError=code");
  assertEquals(pending?.attempts, 1);
  assertEquals(
    await storage.getEmailCredential(account.id, "alice@example.com"),
    undefined,
  );
  assertEquals(updatedAccount?.primaryEmail, undefined);
  assertEquals(updatedAccount?.emailVerified, undefined);
});

Deno.test("settings route renders TOTP setup material", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const response = await app.request("/settings?totpSetup=1", {
    headers: testCsrfHeaders({ cookie }),
  });
  const html = await response.text();

  assertEquals(response.status, 200);
  assertIncludes(html, `data-totp-binding-form`);
  assertIncludes(html, `data-totp-manual-key`);
  assertIncludes(html, `data-totp-otpauth-uri`);
  assertIncludes(html, `otpauth://totp/`);
  assertIncludes(html, `name="secretEncrypted"`);
  assertEquals(await storage.getTotpCredential(account.id), undefined);
});

Deno.test("account TOTP route binds an authenticator after a valid code", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const setupResponse = await app.request("/settings?totpSetup=1", {
    headers: testCsrfHeaders({ cookie }),
  });
  const setupHtml = await setupResponse.text();
  const secretEncrypted = hiddenInputValue(setupHtml, "secretEncrypted");
  const secret = await decryptTotpSecret(
    secretEncrypted,
    testTotpConfig.secretEncryptionKey,
  );
  const code = await generateTotpCode(secret, testTotpConfig);

  const response = await app.request("/account/totp/verify", {
    body: testCsrfForm(
      new URLSearchParams({
        code,
        secretEncrypted,
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });
  const credential = await storage.getTotpCredential(account.id);

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?totp=updated");
  assertEquals(credential?.secretEncrypted, secretEncrypted);
  assertEquals(credential?.recoveryCodeHashes, []);
});

Deno.test("account TOTP route rejects an incorrect setup code", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const setupResponse = await app.request("/settings?totpSetup=1", {
    headers: testCsrfHeaders({ cookie }),
  });
  const setupHtml = await setupResponse.text();
  const secretEncrypted = hiddenInputValue(setupHtml, "secretEncrypted");
  const secret = await decryptTotpSecret(
    secretEncrypted,
    testTotpConfig.secretEncryptionKey,
  );
  const currentCode = await generateTotpCode(secret, testTotpConfig);
  const wrongCode = currentCode === "000000" ? "111111" : "000000";

  const response = await app.request("/account/totp/verify", {
    body: testCsrfForm(
      new URLSearchParams({
        code: wrongCode,
        secretEncrypted,
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?totpError=code");
  assertEquals(await storage.getTotpCredential(account.id), undefined);
});

Deno.test("account security route enables 2FA when a verified method exists", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }
  await storage.saveEmailCredential({
    createdAt: "2026-07-31T12:00:00.000Z",
    email: "alice@example.com",
    lastVerifiedAt: "2026-07-31T12:05:00.000Z",
    userId: account.id,
    verified: true,
  });

  const response = await app.request("/account/security", {
    body: testCsrfForm(
      new URLSearchParams({
        preferredSecondFactor: "email",
        twoFactorEnabled: "on",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?security=updated");
  assertEquals(await storage.getUserSecuritySettings(account.id), {
    preferredSecondFactor: "email",
    twoFactorEnabled: true,
    userId: account.id,
  });
});

Deno.test("account security route enables 2FA when a TOTP credential exists", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }
  await storage.saveTotpCredential({
    enabledAt: "2026-08-01T00:00:00.000Z",
    recoveryCodeHashes: [],
    secretEncrypted: "encrypted-secret",
    userId: account.id,
  });

  const response = await app.request("/account/security", {
    body: testCsrfForm(
      new URLSearchParams({
        preferredSecondFactor: "totp",
        twoFactorEnabled: "on",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?security=updated");
  assertEquals(await storage.getUserSecuritySettings(account.id), {
    preferredSecondFactor: "totp",
    twoFactorEnabled: true,
    userId: account.id,
  });
});

Deno.test("account security route rejects enabling 2FA without a method", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }

  const response = await app.request("/account/security", {
    body: testCsrfForm(
      new URLSearchParams({
        twoFactorEnabled: "on",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?securityError=unavailable",
  );
  assertEquals(await storage.getUserSecuritySettings(account.id), {
    preferredSecondFactor: undefined,
    twoFactorEnabled: false,
    userId: account.id,
  });
});

Deno.test("account security route rejects unavailable preferred 2FA methods", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");
  const cookie = registerResponse.headers.get("set-cookie") ?? "";
  const account = await storage.getAccountByUsername("alice");
  if (!account) {
    throw new Error("Expected test account to exist.");
  }
  await storage.saveEmailCredential({
    createdAt: "2026-07-31T12:00:00.000Z",
    email: "alice@example.com",
    lastVerifiedAt: "2026-07-31T12:05:00.000Z",
    userId: account.id,
    verified: true,
  });

  const response = await app.request("/account/security", {
    body: testCsrfForm(
      new URLSearchParams({
        preferredSecondFactor: "passkey",
        twoFactorEnabled: "on",
      }),
    ),
    headers: testCsrfHeaders({ cookie }),
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?securityError=preferred",
  );
  assertEquals(await storage.getUserSecuritySettings(account.id), {
    preferredSecondFactor: undefined,
    twoFactorEnabled: false,
    userId: account.id,
  });
});

Deno.test("test notify returns a readable configuration error", async () => {
  const app = createRoutes({
    notifier: {
      sendTest: () =>
        Promise.reject(new NotificationConfigError("missing webhook")),
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);

  const response = await app.request("/test-notify", {
    body: testCsrfForm(),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 400);
  assertEquals(await response.text(), "missing webhook");
});

Deno.test("test notify preserves upstream rate limit status", async () => {
  const app = createRoutes({
    notifier: {
      sendTest: () =>
        Promise.reject(
          new NotificationDeliveryError(
            'Webhook notification failed with HTTP 429: {"error":"Too Many Requests"}',
            429,
          ),
        ),
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);

  const response = await app.request("/test-notify", {
    body: testCsrfForm(),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 429);
  assertEquals(
    await response.text(),
    'Webhook notification failed with HTTP 429: {"error":"Too Many Requests"}',
  );
});

Deno.test("test notify ajax request returns a readable success message", async () => {
  const app = createRoutes({
    notifier: {
      sendTest: () => Promise.resolve({ provider: "webhook", sent: true }),
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);

  const response = await app.request("/test-notify", {
    body: testCsrfForm(),
    headers: testCsrfHeaders({ "x-test-notify": "1" }),
    method: "POST",
  });

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "通知已发送");
});

Deno.test("simulate match records one randomized pending match through poller", async () => {
  const recorded: unknown[] = [];
  const app = createRoutes({
    poller: {
      recordMatches: (records: unknown[]) => {
        recorded.push(...records);
        return Promise.resolve();
      },
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);

  const response = await app.request("/simulate-match", {
    body: testCsrfForm(),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(recorded.length, 1);
  const record = recorded[0] as {
    keyword: string;
    post: { excerpt: string; title: string; url: string };
  };
  assertEquals(
    record.post.url,
    "https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/",
  );
  assertEquals(record.post.title.startsWith("模拟命中帖（测试 "), true);
  assertEquals(record.post.excerpt.startsWith("模拟命中帖，随机样本 "), true);
  assertEquals(
    record.post.excerpt.endsWith("这是一条用于验证命中记录的测试内容。"),
    true,
  );
  assertEquals(record.keyword.startsWith("测试关键词 "), true);
});

Deno.test("simulate match preserves dashboard table query", async () => {
  const app = createRoutes({
    poller: {
      recordMatches: () => Promise.resolve(),
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);
  const form = new URLSearchParams();
  form.set("returnTo", "/?range=week&page=3&pageSize=50");

  const response = await app.request("/simulate-match", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 302);
  assertEquals(
    response.headers.get("location"),
    "/?range=week&page=3&pageSize=50",
  );
});

Deno.test("run now preserves dashboard table query and requests reset animation", async () => {
  const app = createRoutes({
    poller: {
      runOnce: () => Promise.resolve(),
    },
  } as unknown as AppContext);
  const form = new URLSearchParams();
  form.set("returnTo", "/?range=day&page=2&pageSize=100");
  form.set("pollResetStart", "42.5");

  const response = await app.request("/run-now", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(response.status, 302);
  assertEquals(
    response.headers.get("location"),
    "/?range=day&page=2&pageSize=100&pollReset=1&pollResetStart=42.5",
  );
});

Deno.test("run now rate limits repeated manual polling attempts", async () => {
  let runs = 0;
  const app = createRoutes({
    poller: {
      runOnce: () => {
        runs += 1;
        return Promise.resolve();
      },
    },
    storage: {
      ...createMemoryRateLimitRecorder(),
      getSession: () => Promise.resolve(undefined),
    },
  } as unknown as AppContext);
  const headers = testCsrfHeaders({ "x-forwarded-for": "203.0.113.20" });

  for (let index = 0; index < 6; index += 1) {
    const response = await app.request("/run-now", {
      body: testCsrfForm(),
      headers,
      method: "POST",
    });
    assertEquals(response.status, 302);
  }

  const limitedResponse = await app.request("/run-now", {
    body: testCsrfForm(),
    headers,
    method: "POST",
  });

  assertEquals(limitedResponse.status, 429);
  assertEquals(limitedResponse.headers.get("retry-after") !== null, true);
  assertEquals(runs, 6);
});

Deno.test("dashboard state ticks scheduler only when requested", async () => {
  let ticks = 0;
  const app = createRoutes({
    scheduler: {
      tick: () => {
        ticks += 1;
        return Promise.resolve(true);
      },
    },
    storage: {
      getDashboardSnapshot: () =>
        Promise.resolve({
          pendingMatches: [],
          settings: currentSettings,
          state: {
            lastPollAt: "2026-07-16T08:00:00.000Z",
            totalMatches: 0,
          },
        }),
    },
  } as unknown as AppContext);

  const regularResponse = await app.request("/dashboard-state?page=2");
  const ignoredTickResponse = await app.request(
    "/dashboard-state?page=2&tick=1",
  );
  const missingCsrfResponse = await app.request(
    "/dashboard-state/tick?page=2",
    {
      method: "POST",
    },
  );
  const tickedResponse = await app.request("/dashboard-state/tick?page=2", {
    headers: testCsrfHeaders({ "x-csrf-token": testCsrfToken }),
    method: "POST",
  });

  assertEquals(regularResponse.status, 200);
  assertEquals(ignoredTickResponse.status, 200);
  assertEquals(missingCsrfResponse.status, 403);
  assertEquals(tickedResponse.status, 200);
  assertEquals(ticks, 1);
});

Deno.test("complete matches handles all selected ids and ignores empty submissions", async () => {
  const completed: string[][] = [];
  const app = createRoutes({
    storage: {
      completeMatches: (ids: string[]) => {
        completed.push(ids);
        return Promise.resolve();
      },
    },
  } as unknown as AppContext);

  const selected = new URLSearchParams();
  selected.append("matchId", "first");
  selected.append("matchId", "second");
  selected.set("returnTo", "/?range=week&page=3&pageSize=50");

  const selectedResponse = await app.request("/matches/complete", {
    body: testCsrfForm(selected),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const emptyResponse = await app.request("/matches/complete", {
    body: testCsrfForm(),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(selectedResponse.status, 302);
  assertEquals(emptyResponse.status, 302);
  assertEquals(
    selectedResponse.headers.get("location"),
    "/?range=week&page=3&pageSize=50",
  );
  assertEquals(emptyResponse.headers.get("location"), "/");
  assertEquals(completed, [["first", "second"]]);
});

Deno.test("complete matches ajax returns refreshed pending table", async () => {
  const completed: string[][] = [];
  const app = createRoutes({
    storage: {
      completeMatches: (ids: string[]) => {
        completed.push(ids);
        return Promise.resolve();
      },
      getDashboardSnapshot: () =>
        Promise.resolve({
          pendingMatches: [routeMatchRecord("remaining-pending")],
          settings: currentSettings,
          state: { totalMatches: 1 },
        }),
    },
  } as unknown as AppContext);

  const form = new URLSearchParams();
  form.set("matchId", "finished-pending");
  form.set("returnTo", "/?range=all&page=1&pageSize=10");

  const response = await app.request("/matches/complete", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders({ "x-match-table-refresh": "1" }),
    method: "POST",
  });
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("location"), null);
  assertEquals(completed, [["finished-pending"]]);
  assertIncludes(html, `data-match-table-section="pending-posts-heading"`);
  assertIncludes(html, `data-match-table-form`);
  assertIncludes(html, "remaining-pending");
  assertNotIncludes(html, "<!doctype html>");
});

Deno.test("delete matches handles all selected ids and ignores empty submissions", async () => {
  const deleted: string[][] = [];
  const app = createRoutes({
    storage: {
      deleteMatches: (ids: string[]) => {
        deleted.push(ids);
        return Promise.resolve();
      },
    },
  } as unknown as AppContext);

  const selected = new URLSearchParams();
  selected.append("matchId", "old-first");
  selected.append("matchId", "old-second");
  selected.set("returnTo", "/history?range=day&page=4&pageSize=100");

  const selectedResponse = await app.request("/matches/delete", {
    body: testCsrfForm(selected),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const emptyResponse = await app.request("/matches/delete", {
    body: testCsrfForm(),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(selectedResponse.status, 302);
  assertEquals(emptyResponse.status, 302);
  assertEquals(
    selectedResponse.headers.get("location"),
    "/history?range=day&page=4&pageSize=100",
  );
  assertEquals(emptyResponse.headers.get("location"), "/history");
  assertEquals(deleted, [["old-first", "old-second"]]);
});

Deno.test("delete matches ajax returns refreshed history table", async () => {
  const deleted: string[][] = [];
  const app = createRoutes({
    storage: {
      deleteMatches: (ids: string[]) => {
        deleted.push(ids);
        return Promise.resolve();
      },
      getSettings: () => Promise.resolve(currentSettings),
      listHistory: () =>
        Promise.resolve([routeMatchRecord("remaining-history")]),
    },
  } as unknown as AppContext);

  const form = new URLSearchParams();
  form.set("matchId", "deleted-history");
  form.set("returnTo", "/history?range=all&page=1&pageSize=10");

  const response = await app.request("/matches/delete", {
    body: testCsrfForm(form),
    headers: testCsrfHeaders({ "x-match-table-refresh": "1" }),
    method: "POST",
  });
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("location"), null);
  assertEquals(deleted, [["deleted-history"]]);
  assertIncludes(html, `data-match-table-section="history-table-heading"`);
  assertIncludes(html, `data-match-table-form`);
  assertIncludes(html, "remaining-history");
  assertNotIncludes(html, "<!doctype html>");
});

Deno.test("match redirects reject paths outside their table", async () => {
  const completed: string[][] = [];
  const deleted: string[][] = [];
  const app = createRoutes({
    storage: {
      completeMatches: (ids: string[]) => {
        completed.push(ids);
        return Promise.resolve();
      },
      deleteMatches: (ids: string[]) => {
        deleted.push(ids);
        return Promise.resolve();
      },
    },
  } as unknown as AppContext);

  const completeForm = new URLSearchParams();
  completeForm.set("matchId", "first");
  completeForm.set("returnTo", "https://example.com/history?page=9");
  const deleteForm = new URLSearchParams();
  deleteForm.set("matchId", "old-first");
  deleteForm.set("returnTo", "/?page=9&pageSize=500");

  const completeResponse = await app.request("/matches/complete", {
    body: testCsrfForm(completeForm),
    headers: testCsrfHeaders(),
    method: "POST",
  });
  const deleteResponse = await app.request("/matches/delete", {
    body: testCsrfForm(deleteForm),
    headers: testCsrfHeaders(),
    method: "POST",
  });

  assertEquals(completeResponse.headers.get("location"), "/");
  assertEquals(deleteResponse.headers.get("location"), "/history");
  assertEquals(completed, [["first"]]);
  assertEquals(deleted, [["old-first"]]);
});

/**
 * 创建包含认证和业务路由的测试应用。
 *
 * @param storage 账户与路由测试使用的内存存储。
 * @return 配置完成的 Hono 测试应用。
 */
function createAccountRouteApp(storage: AccountRouteStorage): Hono {
  const app = new Hono();
  app.route("/", createAuthRoutes(storage as never));
  app.use("*", createAuthMiddleware(storage as never));
  app.route(
    "/",
    createRoutes({
      config: {
        emailVerification: testEmailVerificationConfig,
        totp: testTotpConfig,
        turnstile: { enabled: false, secretKey: "", siteKey: "" },
      },
      storage,
    } as unknown as AppContext),
  );
  return app;
}
function createAccountRouteStorage(): AccountRouteStorage {
  let appSettings = currentSettings;
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
  const emailCredentialsByKey = new Map<string, EmailCredential>();
  const passwordCredentialsByUserId = new Map<string, PasswordCredential>();
  const pendingEmailVerificationsById = new Map<
    string,
    PendingEmailVerification
  >();
  const securitySettingsByUserId = new Map<string, UserSecuritySettings>();
  const sessionsByTokenHash = new Map<string, UserSession>();
  const totpCredentialsByUserId = new Map<string, TotpCredential>();

  return {
    ...createMemoryRateLimitRecorder(),
    getSettings: () => Promise.resolve(appSettings),
    saveSettings: (settings: AppSettings) => {
      appSettings = settings;
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
      const existingId = accountIdsByUsername.get(nextUsername);
      if (existingId && existingId !== account.id) {
        return Promise.resolve(false);
      }

      accountIdsByUsername.delete(currentUsername);
      accountIdsByUsername.set(nextUsername, account.id);
      accountsById.set(account.id, { ...account, username: nextUsername });
      return Promise.resolve(true);
    },
    getAccountById: (id: string) => Promise.resolve(accountsById.get(id)),
    getAccountByUsername: (username: string) => {
      const id = accountIdsByUsername.get(username.trim().toLowerCase());
      return Promise.resolve(id ? accountsById.get(id) : undefined);
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
    getLoginFailure: () => Promise.resolve(undefined),
    recordLoginFailure: () => Promise.resolve({ failures: 1 }),
    clearLoginFailures: () => Promise.resolve(),
    getSession: (tokenHash: string) =>
      Promise.resolve(sessionsByTokenHash.get(tokenHash)),
    saveSession: (session: UserSession) => {
      sessionsByTokenHash.set(session.tokenHash, session);
      return Promise.resolve();
    },
    deleteSession: (tokenHash: string) => {
      sessionsByTokenHash.delete(tokenHash);
      return Promise.resolve();
    },
  };
}

/**
 * 创建内存邮箱凭证键。
 *
 * @param userId 用户 ID。
 * @param email 邮箱地址。
 * @return 邮箱凭证键。
 */
function emailCredentialKey(userId: string, email: string): string {
  return `${userId}:${email.trim().toLowerCase()}`;
}

/**
 * 创建路由测试使用的命中记录。
 *
 * @param id 命中记录与帖子 ID。
 * @return 命中记录。
 */
function routeMatchRecord(id: string): MatchRecord {
  return {
    id,
    keyword: "测试关键词",
    location: "title",
    matchedAt: "2026-06-30T12:00:00.000Z",
    post: {
      body: "测试正文",
      commentReplies: [],
      comments: [],
      excerpt: "测试摘要",
      id,
      publishedAt: "2026-06-30T11:00:00.000Z",
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

/**
 * 从 HTML 中读取指定隐藏输入框的值。
 *
 * @param html HTML 字符串。
 * @param name 输入框名称。
 * @return 输入框值。
 */
function hiddenInputValue(html: string, name: string): string {
  const pattern = new RegExp(
    `<input[^>]*name="${escapeRegExp(name)}"[^>]*value="([^"]*)"`,
    "i",
  );
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Expected hidden input ${name} to exist.`);
  }

  return match[1];
}

/**
 * 转义正则表达式中的特殊字符。
 *
 * @param value 原始字符串。
 * @return 可安全放入正则表达式的字符串。
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 断言字符串包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 期望包含的片段。
 */
function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include ${expected}`);
  }
}

/**
 * 断言字符串不包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 不期望出现的片段。
 */
function assertNotIncludes(actual: string, expected: string): void {
  if (actual.includes(expected)) {
    throw new Error(`Expected output not to include ${expected}`);
  }
}
