import { createRoutes, settingsFromForm } from "./routes.ts";
import type { AppSettings } from "./models.ts";
import type { AppContext } from "./services/app_context.ts";
import { NotificationConfigError } from "./services/notifier.ts";

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

Deno.test("health check returns deployment status without storage access", async () => {
  const app = createRoutes({} as AppContext);
  const response = await app.request("/healthz");
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.status, "ok");
  assertEquals(body.service, "heybox-topic-notifier");
});

Deno.test("settingsFromForm preserves submitted inactive keyword groups", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "12099",
    commonKeywordRulesJson: JSON.stringify([{ keyword: "new-common", locations: ["body"] }]),
    darkMode: "on",
    keyword_0: "new-topic",
    keyword_0_location_replies: "on",
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
    topic_1_keywordRulesJson: JSON.stringify([{ keyword: "new-other", locations: ["comments"] }]),
    topic_1_note: "其它",
  }, currentSettings);

  assertEquals(settings.commonKeywordRules, [{ keyword: "new-common", locations: ["body"] }]);
  assertEquals(settings.topics[0].keywordRules, [
    { keyword: "new-topic", locations: ["replies"] },
  ]);
  assertEquals(settings.topics[1].keywordRules, [
    { keyword: "new-other", locations: ["comments"] },
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
    keyword_0_location_title: "on",
    keyword_0_location_body: "on",
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
    { keyword: "visible-common", locations: ["title", "body"] },
  ]);
  assertEquals(settings.topics[0].keywordRules, [
    { keyword: "submitted-topic", locations: ["title"] },
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

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
