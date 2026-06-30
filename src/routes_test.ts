import { createRoutes, settingsFromForm } from "./routes.ts";
import type { AppSettings } from "./models.ts";
import type { AppContext } from "./services/app_context.ts";

const currentSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [
    { keyword: "old-common", locations: ["title"] },
  ],
  darkMode: false,
  locale: "zh-CN",
  notificationProvider: "webhook",
  polling: {
    intervalMinutes: 1,
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
    notificationProvider: "email",
    pollIntervalMinutes: "3",
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
  assertEquals(settings.notificationProvider, "email");
  assertEquals(settings.polling, {
    intervalMinutes: 3,
    postLimit: 50,
    sort: "replyTime",
  });
  assertEquals(settings.themeColor, "#123abc");
});

Deno.test("settingsFromForm saves visible common keywords and submitted topic keywords", () => {
  const settings = settingsFromForm({
    activeKeywordTarget: "common",
    keyword_0: "visible-common",
    keyword_0_location_title: "on",
    keyword_0_location_body: "on",
    locale: "zh-CN",
    notificationProvider: "webhook",
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
    notificationProvider: "webhook",
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

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
