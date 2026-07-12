import type { AppSettings, MatchRecord, TopicPost } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";
import type { TopicSource } from "./topic_source.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [{ keyword: "common-hit", locations: ["title"] }],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "test@example.com",
  notificationEmailApiToken: "email-api-token",
  notificationEmailApiUrl: "https://example.com/email-api",
  notificationEmailFrom: "from@example.com",
  notificationEmailService: "smtp",
  notificationProvider: "webhook",
  notificationPushPlusToken: "pushplus-test",
  notificationServerChanSendKey: "SCT-test",
  notificationSmtpHost: "smtp.example.com",
  notificationSmtpPassword: "smtp-password",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "smtp-user",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "https://example.com/webhook",
  notificationWxPusherSpt: "SPT-test",
  polling: {
    intervalMinutes: 1,
    postLimit: 50,
    sort: "replyTime",
  },
  themeColor: "#bd7fff",
  topics: [
    {
      enabled: true,
      id: "12099",
      keywordRules: [{ keyword: "topic-hit", locations: ["comments"] }],
      note: "蔚蓝",
    },
    {
      enabled: false,
      id: "999",
      keywordRules: [{ keyword: "disabled-hit", locations: ["title"] }],
      note: "关闭",
    },
  ],
};

const postsByTopic: Record<string, TopicPost[]> = {
  "12099": [
    post("p1", { title: "common-hit in title" }),
    post("p2", { comments: ["topic-hit in comments"] }),
    post("p3", { title: "common-hit already seen" }),
    post("p4", { title: "nothing" }),
  ],
  "999": [
    post("disabled", { title: "disabled-hit should not poll" }),
  ],
};

Deno.test("poller combines common and topic keywords for enabled topics", async () => {
  const listedTopicIds: string[] = [];
  const listedOptions: unknown[] = [];
  const records: MatchRecord[] = [];
  const notifiedMatches: string[] = [];
  const seenPosts: string[] = [];
  let sentMatches = 0;
  let sentMatchCount = 0;
  let lastPollAt = "";

  const poller = createPoller({
    matcher: createMatcher(),
    notifier: {
      sendMatch: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendMatches: (matchedRecords: MatchRecord[]) => {
        sentMatches += 1;
        sentMatchCount = matchedRecords.length;
        return Promise.resolve({ provider: "webhook", sent: true });
      },
      sendNotification: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendTest: () => Promise.resolve({ provider: "webhook", sent: true }),
    } as ReturnType<typeof createNotifier>,
    source: {
      listLatestPosts: (topicId, options) => {
        listedTopicIds.push(topicId);
        listedOptions.push(options);
        return Promise.resolve(postsByTopic[topicId] ?? []);
      },
    } as TopicSource,
    storage: {
      getSettings: () => Promise.resolve(settings),
      hasSeenPost: (postId: string) => Promise.resolve(postId === "p3"),
      saveMatch: (record: MatchRecord) => {
        records.push(record);
        return Promise.resolve();
      },
      markMatchNotified: (id: string) => {
        notifiedMatches.push(id);
        return Promise.resolve();
      },
      markPostSeen: (postId: string) => {
        seenPosts.push(postId);
        return Promise.resolve();
      },
      setLastPollAt: (value: string) => {
        lastPollAt = value;
        return Promise.resolve();
      },
    } as unknown as ReturnType<typeof createKvStorage>,
  });

  await poller.runOnce();

  assertEquals(listedTopicIds, ["12099"]);
  assertEquals(listedOptions, [{ limit: 50, sort: "replyTime" }]);
  assertEquals(records.map((record) => [record.post.id, record.keyword, record.location]), [
    ["p1", "common-hit", "title"],
    ["p2", "topic-hit", "comments"],
  ]);
  assertEquals(sentMatches, 1);
  assertEquals(sentMatchCount, 2);
  assertEquals(seenPosts, ["p1", "p2"]);
  assertEquals(notifiedMatches, records.map((record) => record.id));
  if (!lastPollAt) {
    throw new Error("Expected last poll timestamp to be saved");
  }
});

Deno.test("poller leaves matched posts retryable when notification fails", async () => {
  const records: MatchRecord[] = [];
  const seenPosts: string[] = [];
  const notifiedMatches: string[] = [];
  const poller = createPoller({
    matcher: createMatcher(),
    notifier: {
      sendMatch: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendMatches: () => Promise.reject(new Error("webhook failed")),
      sendNotification: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendTest: () => Promise.resolve({ provider: "webhook", sent: true }),
    } as ReturnType<typeof createNotifier>,
    source: {
      listLatestPosts: () => Promise.resolve([post("retry-me", { title: "common-hit" })]),
    } as TopicSource,
    storage: {
      getSettings: () => Promise.resolve(settings),
      hasSeenPost: () => Promise.resolve(false),
      markMatchNotified: (id: string) => {
        notifiedMatches.push(id);
        return Promise.resolve();
      },
      markPostSeen: (postId: string) => {
        seenPosts.push(postId);
        return Promise.resolve();
      },
      saveMatch: (record: MatchRecord) => {
        records.push(record);
        return Promise.resolve();
      },
      setLastPollAt: () => Promise.resolve(),
    } as unknown as ReturnType<typeof createKvStorage>,
  });

  await assertRejects(() => poller.runOnce(), "webhook failed");

  assertEquals(records.map((record) => record.post.id), ["retry-me"]);
  assertEquals(seenPosts, []);
  assertEquals(notifiedMatches, []);
});

function post(id: string, overrides: Partial<TopicPost>): TopicPost {
  return {
    body: "",
    commentReplies: [],
    comments: [],
    excerpt: "",
    id,
    publishedAt: "2026-06-30T00:00:00.000Z",
    title: "",
    url: `https://example.com/${id}`,
    ...overrides,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      return;
    }
    throw error;
  }

  throw new Error(`Expected rejection with message: ${message}`);
}
