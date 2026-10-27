/** @file 验证三种匹配模式的缓存复用、配置失效、限额、重试和用户租约。 */
import { assert, assertEquals } from "../test_helpers.ts";
import type { AppSettings, TopicPost } from "../models.ts";
import { createKvStorage } from "../storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { normalizeMatchingSettings } from "./matching_settings.ts";
import { createMatcher } from "./matcher.ts";
import { matchingHash, startMatchingRun } from "./matching_engine.ts";
import type { AiDecision } from "./ai_matcher.ts";
import { matchingDayMs, observeTopic } from "./matching_activity.ts";
import type { TopicSource } from "./topic_source.ts";
import { createPoller } from "./poller.ts";

/**
 * 构造包含指定标识和正文的测试帖子。
 *
 * @param {string} id 帖子标识。
 * @param {string} body 正文。
 * @return {TopicPost} 测试帖子。
 */
function post(id = "p1", body = "关卡问题"): TopicPost {
  return {
    id,
    title: "需要帮助",
    body,
    excerpt: "",
    comments: [],
    commentReplies: [],
    publishedAt: "2026-10-01T00:00:00Z",
    url: `https://www.xiaoheihe.cn/app/bbs/link/${id}`,
  };
}

/**
 * 创建真实内存 KV 与可控 AI、时钟，关闭时释放全部资源。
 * @return {Promise<object>} 测试上下文。
 */
async function fixture() {
  const kv = await Deno.openKv(":memory:");
  const app: AppSettings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      mode: "ai",
      apiUrl: "https://example.com/v1",
      apiKey: "test-secret",
      model: "classifier",
    }),
    commonKeywordRules: [{ keyword: "求助", locations: ["body"] }],
    topics: [{ id: "topic", note: "测试", enabled: true, keywordRules: [] }],
  };
  const storage = createKvStorage(app, { openKv: () => Promise.resolve(kv) });
  const store = storage.matching!;
  let time = Date.parse("2026-10-01T00:00:00Z");
  let calls = 0;
  let decision: AiDecision = {
    decision: "no_match",
    reason: "不是求助",
    inputTokens: 100,
    outputTokens: 20,
    usageKnown: true,
  };
  const source: TopicSource = {
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: (value) =>
      Promise.resolve({ ...value, detailsComplete: true }),
  };
  const ai = {
    classify: () => {
      calls++;
      return Promise.resolve(decision);
    },
  };
  /**
   * 执行一次可控时钟下的匹配会话并收集结果。
   *
   * @param {TopicPost[]} posts 帖子。
   * @return {Promise<Array<unknown>>} 本次匹配结果。
   */
  async function run(posts = [post()]): Promise<Array<unknown>> {
    const matcher = createMatcher().createSession();
    const session = await startMatchingRun(
      app,
      store,
      matcher,
      source,
      ai,
      () => time,
    );
    assert(session);
    try {
      const results = [];
      for (const item of await session.observe(app.topics[0], posts)) {
        results.push(
          await session.findMatch(item, app.topics[0], app.commonKeywordRules),
        );
      }
      return results;
    } finally {
      await session.close();
      matcher.close();
    }
  }
  return {
    app,
    store,
    storage,
    source,
    ai,
    run,
    /**
     * 读取模拟模型的累计调用次数。
     *
     * @return {number} 模型调用次数。
     */
    calls: () => calls,
    /**
     * 推进测试时钟。
     *
     * @param {number} ms 时间增量。
     */
    advance: (ms: number) => {
      time += ms;
    },
    /**
     * 设置模拟模型的下一次响应。
     *
     * @param {AiDecision} value 模型响应。
     */
    decide: (value: AiDecision) => {
      decision = value;
    },
    /**
     * 读取测试时钟的当前值。
     *
     * @return {number} 当前时间。
     */
    now: () => time,
    /** 释放内存数据库。 */
    close: () => kv.close(),
  };
}

Deno.test("matching caches negative results across sessions and refreshes unchanged details without AI", async () => {
  const f = await fixture();
  try {
    await f.run();
    await f.run();
    f.advance(7 * 3600000);
    await f.run();
    assertEquals(f.calls(), 1);
    const entry = await f.store.get(await matchingHash(["topic", "p1"]));
    assertEquals(entry?.result, null);
    assertEquals(entry?.pendingPost, undefined);
    assertEquals(JSON.stringify(entry).includes("关卡问题"), false);
    assertEquals((await f.store.runtime())?.hits, 2);
  } finally {
    f.close();
  }
});

Deno.test("poller integrates AI results with existing match records and notification deduplication", async () => {
  const f = await fixture();
  try {
    f.source.listLatestPosts = () => Promise.resolve([post()]);
    f.decide({
      decision: "match",
      reason: "需要帮助",
      inputTokens: 100,
      outputTokens: 20,
      usageKnown: true,
    });
    let notifications = 0;
    const poller = createPoller({
      matcher: createMatcher(),
      storage: f.storage,
      source: f.source,
      ai: f.ai,
      notifier: {
        sendMatches: () => {
          notifications++;
          return Promise.resolve({ sent: true, provider: "webhook" as const });
        },
      },
    });
    await poller.runOnce(f.storage, f.app);
    await poller.runOnce(f.storage, f.app);
    assertEquals(f.calls(), 1);
    assertEquals(notifications, 1);
    const history = await f.storage.listHistory();
    assertEquals(history.length, 1);
    assert(history[0].keyword.startsWith("AI:"));
    assert(history[0].notifiedAt);
  } finally {
    f.close();
  }
});

Deno.test("matching invalidates changed content and prompts but not price or budgets", async () => {
  const f = await fixture();
  try {
    await f.run();
    f.app.matching!.inputPrice = 5;
    f.app.matching!.dailyLimit = 900;
    await f.run();
    assertEquals(f.calls(), 1);
    await f.run([post("p1", "新的内容")]);
    assertEquals(f.calls(), 2);
    f.app.matching!.prompt += " 包含模组问题。";
    await f.run([post("p1", "新的内容")]);
    assertEquals(f.calls(), 3);
    f.advance(31 * matchingDayMs);
    await f.run([post("p1", "新的内容")]);
    assertEquals(f.calls(), 4);
  } finally {
    f.close();
  }
});

Deno.test("rules use no AI while hybrid evaluates rules against full details", async () => {
  const f = await fixture();
  try {
    f.app.matching!.mode = "rules";
    assertEquals(await f.run([post("p1", "求助")]), [{
      keyword: "求助",
      location: "body",
    }]);
    assertEquals(f.calls(), 0);
    f.app.matching!.mode = "hybrid";
    await f.run([post("p2", "通关分享")]);
    assertEquals(f.calls(), 0);
    f.source.getPostDetails = (value) =>
      Promise.resolve({
        ...value,
        body: "求助，这是完整正文",
        detailsComplete: true,
      });
    f.decide({
      decision: "match",
      reason: "正在求助",
      inputTokens: 100,
      outputTokens: 20,
      usageKnown: true,
    });
    assertEquals(await f.run([post("p3", "列表没有关键词")]), [{
      keyword: "求助",
      location: "body",
    }]);
    assertEquals(f.calls(), 1);
  } finally {
    f.close();
  }
});

Deno.test("daily limit reserves attempts and keeps posts queued after they leave the feed", async () => {
  const f = await fixture();
  try {
    f.app.matching!.dailyLimit = 1;
    await f.run([post("p1"), post("p2")]);
    assertEquals(f.calls(), 1);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
    await f.run([]);
    assertEquals(f.calls(), 1);
    f.advance(matchingDayMs);
    await f.run([]);
    assertEquals(f.calls(), 2);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
    assertEquals((await f.store.runtime())?.calls, 1);
  } finally {
    f.close();
  }
});

Deno.test("failed calls never become negative results and stop after three attempts", async () => {
  const f = await fixture();
  try {
    f.decide({
      error: "AI HTTP 429",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    await f.run();
    await f.run();
    assertEquals(f.calls(), 1);
    f.advance(600000);
    await f.run();
    f.advance(1200000);
    await f.run();
    f.advance(3600000);
    await f.run();
    assertEquals(f.calls(), 3);
    const state = await f.store.runtime();
    assertEquals(state?.unknownUsage, 3);
    assertEquals(state?.failures, 3);
    assertEquals(
      (await f.store.get(await matchingHash(["topic", "p1"])))?.result,
      undefined,
    );
    f.app.matching!.apiKey = "replacement";
    await f.run();
    assertEquals(f.calls(), 4);
  } finally {
    f.close();
  }
});

Deno.test("incomplete details do not call AI or cache a negative result", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    await f.run();
    assertEquals(f.calls(), 0);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
  } finally {
    f.close();
  }
});

Deno.test("queued hybrid snapshots keep original fingerprints and retry limits after truncation", async () => {
  const f = await fixture();
  try {
    f.app.matching!.mode = "hybrid";
    f.app.matching!.maxInputChars = 200;
    f.decide({
      error: "AI HTTP 503",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    f.source.getPostDetails = (value) =>
      Promise.resolve({
        ...value,
        body: "求助".repeat(500),
        detailsComplete: true,
      });
    await f.run([post("p1", "求助".repeat(500))]);
    const original = await f.store.get(await matchingHash(["topic", "p1"]));
    for (let i = 0; i < 4; i++) {
      f.advance(3600000);
      await f.run([]);
    }
    const final = await f.store.get(await matchingHash(["topic", "p1"]));
    assertEquals(f.calls(), 3);
    assertEquals(final?.fingerprint, original?.fingerprint);
    assertEquals(final?.lastSeenAt, original?.lastSeenAt);
  } finally {
    f.close();
  }
});

Deno.test("persisted user leases prevent concurrent matching and isolate users", async () => {
  const f = await fixture();
  const matcher = createMatcher().createSession();
  try {
    const first = await startMatchingRun(
      f.app,
      f.store,
      matcher,
      f.source,
      f.ai,
      f.now,
    );
    assert(first);
    const second = await startMatchingRun(
      f.app,
      f.store,
      matcher,
      f.source,
      f.ai,
      f.now,
    );
    assertEquals(second, undefined);
    assertEquals(
      await f.storage.forUser("other").matching!.acquire("other", f.now()),
      true,
    );
    await first.close();
    await f.run();
    assertEquals(
      await f.storage.forUser("other").matching!.get(
        await matchingHash(["topic", "p1"]),
      ),
      undefined,
    );
  } finally {
    matcher.close();
    f.close();
  }
});

Deno.test("dynamic retention warms up, adapts to activity and resets observation on polling changes", () => {
  const polling = {
    enabled: true,
    intervalUnit: "minute" as const,
    intervalValue: 1,
    postLimit: 20,
    sort: "publishTime" as const,
  };
  let quiet = observeTopic(undefined, ["p1"], polling, 0);
  let busy = observeTopic(undefined, ["p1"], polling, 0);
  for (let minute = 1; minute <= 2880; minute++) {
    quiet = observeTopic(quiet, ["p1"], polling, minute * 60000);
    busy = observeTopic(
      busy,
      Array.from({ length: 20 }, (_, i) => `${minute}-${i}`),
      polling,
      minute * 60000,
    );
    if (minute === 100) assertEquals(quiet.ttlDays, 7);
  }
  assert(quiet.ttlDays > 7 && quiet.ttlDays <= 30);
  assert(busy.ttlDays < 7 && busy.ttlDays >= 1);
  assert(busy.saturated);
  const reset = observeTopic(
    busy,
    ["p1"],
    { ...polling, postLimit: 100 },
    2881 * 60000,
  );
  assertEquals(reset.observedMs, 0);
  assertEquals(reset.ttlDays, busy.ttlDays);
  const downtime = observeTopic(quiet, ["p1"], polling, 10 * matchingDayMs);
  assertEquals(downtime.observedMs, 0);
});
