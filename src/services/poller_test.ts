import type { AppSettings, MatchRecord, TopicPost } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import type { createMockTopicSource } from "./mock_topic_source.ts";
import type { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [{ keyword: "common-hit", locations: ["title"] }],
  darkMode: false,
  locale: "zh-CN",
  notificationProvider: "webhook",
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
  const records: MatchRecord[] = [];
  let sentMatches = 0;
  let lastPollAt = "";

  const poller = createPoller({
    matcher: createMatcher(),
    notifier: {
      sendMatch: () => {
        sentMatches += 1;
        return Promise.resolve();
      },
    } as ReturnType<typeof createNotifier>,
    source: {
      listLatestPosts: (topicId: string) => {
        listedTopicIds.push(topicId);
        return Promise.resolve(postsByTopic[topicId] ?? []);
      },
    } as ReturnType<typeof createMockTopicSource>,
    storage: {
      getSettings: () => Promise.resolve(settings),
      hasSeenPost: (postId: string) => Promise.resolve(postId === "p3"),
      saveMatch: (record: MatchRecord) => {
        records.push(record);
        return Promise.resolve();
      },
      setLastPollAt: (value: string) => {
        lastPollAt = value;
        return Promise.resolve();
      },
    } as ReturnType<typeof createKvStorage>,
  });

  await poller.runOnce();

  assertEquals(listedTopicIds, ["12099"]);
  assertEquals(records.map((record) => [record.post.id, record.keyword, record.location]), [
    ["p1", "common-hit", "title"],
    ["p2", "topic-hit", "comments"],
  ]);
  assertEquals(sentMatches, 2);
  if (!lastPollAt) {
    throw new Error("Expected last poll timestamp to be saved");
  }
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
