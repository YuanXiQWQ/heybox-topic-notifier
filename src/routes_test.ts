/**
 * @file 本文件验证业务路由和设置表单解析逻辑。
 */
import { Hono } from "@hono/hono";
import { createRoutes, settingsFromForm } from "./routes.ts";
import { createAuthMiddleware, createAuthRoutes } from "./auth.ts";
import type { AppSettings, UserAccount, UserSession } from "./models.ts";
import type { AppContext } from "./services/app_context.ts";
import { NotificationConfigError, NotificationDeliveryError } from "./services/notifier.ts";
import {
  addUniqueAccount,
  assertEquals,
  submitLogin as login,
  submitRegistration as register,
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
 * 账户相关路由测试使用的内存存储能力。
 */
type AccountRouteStorage = {
  clearLoginFailures(username: string): Promise<void>;
  createAccount(account: UserAccount): Promise<boolean>;
  deleteSession(tokenHash: string): Promise<void>;
  getAccountById(id: string): Promise<UserAccount | undefined>;
  getAccountByUsername(username: string): Promise<UserAccount | undefined>;
  getLoginFailure(username: string): Promise<undefined>;
  getSession(tokenHash: string): Promise<UserSession | undefined>;
  recordLoginFailure(
    username: string,
    maxFailures: number,
    lockoutMs: number,
  ): Promise<{ failures: number }>;
  saveSession(session: UserSession): Promise<void>;
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
    topic_0_keywordRulesJson: JSON.stringify([{ keyword: "stale-topic", locations: ["title"] }]),
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
    { caseSensitive: true, keyword: "new-topic", locations: ["replies"], useRegex: false },
  ]);
  assertEquals(settings.topics[1].keywordRules, [
    { caseSensitive: false, keyword: "new-other", locations: ["comments"], useRegex: true },
  ]);
  assertEquals(settings.darkMode, true);
  assertEquals(settings.notificationEmailAddress, "new@example.com");
  assertEquals(settings.notificationEmailApiToken, "new-api-token");
  assertEquals(settings.notificationEmailApiUrl, "https://example.com/new-email-api");
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
  assertEquals(settings.notificationWebhookUrl, "https://example.com/new-webhook");
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
    { caseSensitive: false, keyword: "submitted-topic", locations: ["title"], useRegex: false },
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
  assertEquals(settings.topics[1].keywordRules, currentSettings.topics[1].keywordRules);
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
    body: form,
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
    method: "POST",
  });
  const loginResponse = await login(app, "yuanxi", "correct-password");

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/settings?account=updated");
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
  assertEquals((await storage.getAccountByUsername("yuanxi"))?.username, "yuanxi");
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
    body: form,
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
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
    body: new URLSearchParams({
      accountAction: "username",
      currentPassword: "correct-password",
      username: "bob",
    }),
    headers: { cookie: aliceResponse.headers.get("set-cookie") ?? "" },
    method: "POST",
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/settings?accountError=exists&accountMode=username",
  );
  assertEquals((await storage.getAccountByUsername("alice"))?.id !== undefined, true);
  assertEquals((await storage.getAccountByUsername("bob"))?.username, "bob");
});

Deno.test("account route rejects password changes without a valid current password", async () => {
  const storage = createAccountRouteStorage();
  const app = createAccountRouteApp(storage);
  const registerResponse = await register(app, "alice", "correct-password");

  const response = await app.request("/account", {
    body: new URLSearchParams({
      accountAction: "password",
      confirmPassword: "new-password",
      currentPassword: "wrong-password",
      newPassword: "new-password",
    }),
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
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
    body: new URLSearchParams({
      accountAction: "password",
      confirmPassword: "correct-password",
      currentPassword: "correct-password",
      newPassword: "correct-password",
    }),
    headers: { cookie: registerResponse.headers.get("set-cookie") ?? "" },
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
    body: new URLSearchParams({ currentPassword: "correct-password" }),
    headers: { cookie },
    method: "POST",
  });
  const rejected = await app.request("/account/verify-password", {
    body: new URLSearchParams({ currentPassword: "wrong-password" }),
    headers: { cookie },
    method: "POST",
  });

  assertEquals(accepted.status, 204);
  assertEquals(rejected.status, 403);
});

Deno.test("test notify returns a readable configuration error", async () => {
  const app = createRoutes({
    notifier: {
      sendTest: () => Promise.reject(new NotificationConfigError("missing webhook")),
    },
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
    },
  } as unknown as AppContext);

  const response = await app.request("/test-notify", { method: "POST" });

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

  const response = await app.request("/test-notify", { method: "POST" });

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
    headers: { "x-test-notify": "1" },
    method: "POST",
  });

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "通知已发送");
});

Deno.test("simulate match saves one randomized pending match", async () => {
  const saved: unknown[] = [];
  const app = createRoutes({
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
      saveMatch: (record: unknown) => {
        saved.push(record);
        return Promise.resolve();
      },
    },
  } as unknown as AppContext);

  const response = await app.request("/simulate-match", { method: "POST" });

  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), "/");
  assertEquals(saved.length, 1);
  const record = saved[0] as {
    keyword: string;
    post: { excerpt: string; title: string; url: string };
  };
  assertEquals(record.post.url, "https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/");
  assertEquals(record.post.title.startsWith("模拟命中帖（测试 "), true);
  assertEquals(record.post.excerpt.startsWith("模拟命中帖，随机样本 "), true);
  assertEquals(record.post.excerpt.endsWith("这是一条用于验证命中记录的测试内容。"), true);
  assertEquals(record.keyword.startsWith("测试关键词 "), true);
});

Deno.test("simulate match preserves dashboard table query", async () => {
  const app = createRoutes({
    storage: {
      getSettings: () => Promise.resolve(currentSettings),
      saveMatch: () => Promise.resolve(),
    },
  } as unknown as AppContext);
  const form = new URLSearchParams();
  form.set("returnTo", "/?range=week&page=3&pageSize=50");

  const response = await app.request("/simulate-match", {
    body: form,
    method: "POST",
  });

  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), "/?range=week&page=3&pageSize=50");
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
    body: form,
    method: "POST",
  });

  assertEquals(response.status, 302);
  assertEquals(
    response.headers.get("location"),
    "/?range=day&page=2&pageSize=100&pollReset=1&pollResetStart=42.5",
  );
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
  const tickedResponse = await app.request("/dashboard-state?page=2&tick=1");

  assertEquals(regularResponse.status, 200);
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
    body: selected,
    method: "POST",
  });
  const emptyResponse = await app.request("/matches/complete", {
    body: new URLSearchParams(),
    method: "POST",
  });

  assertEquals(selectedResponse.status, 302);
  assertEquals(emptyResponse.status, 302);
  assertEquals(selectedResponse.headers.get("location"), "/?range=week&page=3&pageSize=50");
  assertEquals(emptyResponse.headers.get("location"), "/");
  assertEquals(completed, [["first", "second"]]);
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
    body: selected,
    method: "POST",
  });
  const emptyResponse = await app.request("/matches/delete", {
    body: new URLSearchParams(),
    method: "POST",
  });

  assertEquals(selectedResponse.status, 302);
  assertEquals(emptyResponse.status, 302);
  assertEquals(selectedResponse.headers.get("location"), "/history?range=day&page=4&pageSize=100");
  assertEquals(emptyResponse.headers.get("location"), "/history");
  assertEquals(deleted, [["old-first", "old-second"]]);
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
    body: completeForm,
    method: "POST",
  });
  const deleteResponse = await app.request("/matches/delete", {
    body: deleteForm,
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
  app.route("/", createRoutes({ storage } as unknown as AppContext));
  return app;
}
function createAccountRouteStorage(): AccountRouteStorage {
  const accountsById = new Map<string, UserAccount>();
  const accountIdsByUsername = new Map<string, string>();
  const sessionsByTokenHash = new Map<string, UserSession>();

  return {
    createAccount: (account: UserAccount) =>
      Promise.resolve(addUniqueAccount(accountsById, accountIdsByUsername, account)),
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
    getLoginFailure: () => Promise.resolve(undefined),
    recordLoginFailure: () => Promise.resolve({ failures: 1 }),
    clearLoginFailures: () => Promise.resolve(),
    getSession: (tokenHash: string) => Promise.resolve(sessionsByTokenHash.get(tokenHash)),
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
