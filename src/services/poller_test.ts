/**
 * @file 本文件验证轮询器的帖子拉取、匹配、通知和历史更新逻辑。
 */
import type { AppSettings, MatchRecord, TopicPost } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";
import type { TopicSource } from "./topic_source.ts";

/**
 * 轮询器测试使用的应用设置。
 */
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
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
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

/**
 * 按话题 ID 组织的测试帖子列表。
 */
const postsByTopic: Record<string, TopicPost[]> = {
  "12099": [
    post("p1", { title: "common-hit in title" }),
    post("p2", { comments: ["topic-hit in comments"] }),
    post("p3", { title: "common-hit already matched" }),
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
      listHistory: () =>
        Promise.resolve([
          {
            id: "12099:p3:common-hit:title",
            keyword: "common-hit",
            location: "title",
            matchedAt: "2026-06-30T00:00:00.000Z",
            post: postsByTopic["12099"][2],
          },
        ]),
      saveMatch: (record: MatchRecord) => {
        records.push(record);
        return Promise.resolve();
      },
      markMatchNotified: (id: string) => {
        notifiedMatches.push(id);
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
  assertEquals(new Set(records.map((record) => record.matchedAt)).size, 1);
  assertEquals(sentMatches, 1);
  assertEquals(sentMatchCount, 2);
  assertEquals(notifiedMatches, records.map((record) => record.id));
  if (!lastPollAt) {
    throw new Error("Expected last poll timestamp to be saved");
  }
});

Deno.test("poller refreshes existing matched post details without notifying again", async () => {
  const oldPost = post("existing", {
    publishedAt: "2026-07-13T01:20:00.000Z",
    title: "common-hit",
  });
  const refreshedPost = post("existing", {
    publishedAt: "2026-07-12T17:20:00.000Z",
    title: "common-hit",
  });
  const existingRecord: MatchRecord = {
    id: "12099:existing:common-hit:title",
    keyword: "common-hit",
    location: "title",
    matchedAt: "2026-07-13T01:30:00.000Z",
    notifiedAt: "2026-07-13T01:31:00.000Z",
    post: oldPost,
  };
  const savedRecords: MatchRecord[] = [];
  const detailedPostIds: string[] = [];
  let sentMatches = 0;

  const poller = createPoller({
    matcher: createMatcher(),
    notifier: {
      sendMatch: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendMatches: () => {
        sentMatches += 1;
        return Promise.resolve({ provider: "webhook", sent: true });
      },
      sendNotification: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendTest: () => Promise.resolve({ provider: "webhook", sent: true }),
    } as ReturnType<typeof createNotifier>,
    source: {
      getPostDetails: (listedPost) => {
        detailedPostIds.push(listedPost.id);
        return Promise.resolve(refreshedPost);
      },
      listLatestPosts: () => Promise.resolve([oldPost]),
    } as TopicSource,
    storage: {
      getSettings: () => Promise.resolve(settings),
      listHistory: () => Promise.resolve([existingRecord]),
      saveMatch: (record: MatchRecord) => {
        savedRecords.push(record);
        return Promise.resolve();
      },
      markMatchNotified: () => Promise.resolve(),
      setLastPollAt: () => Promise.resolve(),
    } as unknown as ReturnType<typeof createKvStorage>,
  });

  await poller.runOnce();

  assertEquals(savedRecords, [{ ...existingRecord, post: refreshedPost }]);
  assertEquals(detailedPostIds, ["existing"]);
  assertEquals(sentMatches, 0);
});

Deno.test("poller saves detailed post time for new matches", async () => {
  const listedPost = post("new-match", {
    publishedAt: "2026-07-13T01:20:00.000Z",
    title: "common-hit",
  });
  const detailedPost = post("new-match", {
    publishedAt: "2026-07-12T17:20:00.000Z",
    title: "common-hit",
  });
  const savedRecords: MatchRecord[] = [];

  const poller = createPoller({
    matcher: createMatcher(),
    notifier: {
      sendMatch: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendMatches: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendNotification: () => Promise.resolve({ provider: "webhook", sent: true }),
      sendTest: () => Promise.resolve({ provider: "webhook", sent: true }),
    } as ReturnType<typeof createNotifier>,
    source: {
      getPostDetails: () => Promise.resolve(detailedPost),
      listLatestPosts: () => Promise.resolve([listedPost]),
    } as TopicSource,
    storage: {
      getSettings: () => Promise.resolve(settings),
      listHistory: () => Promise.resolve([]),
      saveMatch: (record: MatchRecord) => {
        savedRecords.push(record);
        return Promise.resolve();
      },
      markMatchNotified: () => Promise.resolve(),
      setLastPollAt: () => Promise.resolve(),
    } as unknown as ReturnType<typeof createKvStorage>,
  });

  await poller.runOnce();

  assertEquals(savedRecords.map((record) => record.post), [detailedPost]);
});

Deno.test("poller leaves matched posts retryable when notification fails", async () => {
  const records: MatchRecord[] = [];
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
      listHistory: () => Promise.resolve([]),
      markMatchNotified: (id: string) => {
        notifiedMatches.push(id);
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
  assertEquals(notifiedMatches, []);
});

/**
 * 创建测试帖子。
 *
 * @param id 帖子 ID。
 * @param overrides 需要覆盖的帖子字段。
 * @return 测试帖子。
 */
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

/**
 * 断言异步函数会抛出指定错误信息。
 *
 * @param fn 待执行的异步函数。
 * @param message 期望的错误信息。
 * @return 断言通过时无返回值。
 */
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
