/** @file 验证三种匹配模式、AI 故障回退与通知去重、缓存限额和用户租约。 */
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
import { normalizeMatchResult } from "./match_result.ts";
import { createPollingNotifier } from "./polling_notifier.ts";
import { createNotifier } from "./notifier.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import { withDetailFailover } from "./heybox_detail_failover.ts";
import { getMessages } from "../locales/index.ts";
import {
  createDetailRelayHandler,
  withDetailRelay,
} from "./heybox_detail_relay.ts";

Deno.test("confirmed deletion exits persisted detail retries through source and relay without concealing captcha", async () => {
  const notices: string[] = [];
  const f = await fixture(undefined, (id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  let state = "captcha";
  let requests = 0;
  const upstream = createHeyboxTopicSource({
    now: () => new Date(f.now()),
    fetchFn: (input) => {
      requests++;
      const id = new URL(String(input)).searchParams.get("link_id");
      return Promise.resolve(
        Response.json(
          state === "captcha"
            ? { status: "show_captcha" }
            : state === "deleted"
            ? { status: "failed", msg: "该内容已被删除", result: {} }
            : {
              status: "ok",
              result: {
                link: { linkid: id, title: "恢复内容", description: "正文" },
              },
            },
        ),
      );
    },
  });
  const token = "test-only-detail-relay-token-00000000";
  const handler = createDetailRelayHandler({
    token,
    source: upstream,
    now: f.now,
  });
  f.source.getPostDetails = withDetailRelay(upstream, {
    token,
    url: "https://relay.example/v1/details",
    now: f.now,
    fetchFn: (url, init) => handler(new Request(url, init)),
  }).getPostDetails;
  try {
    await f.run();
    const key = await matchingHash(["topic", "p1"]);
    assert((await f.store.get(key))?.pendingPost);
    assert((await f.store.runtime())?.sourceFailure);
    state = "deleted";
    f.advance(16 * 60000);
    await f.run([]);
    const deleted = (await f.store.get(key))!;
    assertEquals(deleted.detailUnavailable, "deleted");
    assertEquals(deleted.pendingPost, undefined);
    assertEquals(deleted.result, undefined);
    assertEquals(deleted.detailAttempts, 0);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
    assertEquals((await f.store.runtime())?.sourceFailure, undefined);
    assertEquals(notices, []);
    const completedRequests = requests;
    f.advance(7 * 3600000);
    await f.run();
    await f.run([]);
    assertEquals(requests, completedRequests);
    assertEquals(f.calls(), 1);
    state = "available";
    await f.run([post("p1", "修改后的内容")]);
    assertEquals(requests, completedRequests + 1);
    assertEquals((await f.store.get(key))?.detailUnavailable, undefined);
    assertEquals(f.calls(), 2);
  } finally {
    f.close();
  }
});

Deno.test("a deleted post does not clear a simultaneous real detail outage", async () => {
  const notices: string[] = [];
  const f = await fixture(undefined, (id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({
        ...value,
        detailsComplete: false,
        ...(value.id === "deleted"
          ? { detailUnavailable: "deleted" as const }
          : {}),
      });
    await f.run([post("restricted")]);
    f.advance(16 * 60000);
    await f.run([post("deleted"), post("restricted")]);
    assertEquals(notices.length, 1);
    assertEquals((await f.store.runtime())?.sourceFailure?.notified, true);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
  } finally {
    f.close();
  }
});

Deno.test("deleted details preserve saved match contents and do not refresh each polling cycle", async () => {
  const f = await fixture();
  try {
    const saved = {
      id: "old-match",
      keyword: "帮助",
      location: "title" as const,
      matchedAt: "2026-01-01T00:00:00Z",
      detailRefreshedAt: "2026-01-01T00:00:00Z",
      post: { ...post(), body: "已保存的完整正文", detailsComplete: true },
    };
    await f.storage.saveMatch(saved);
    f.source.listLatestPosts = () => Promise.resolve([post()]);
    let requests = 0;
    f.source.getPostDetails = (value) => {
      requests++;
      return Promise.resolve({
        ...value,
        detailsComplete: false,
        detailUnavailable: "deleted",
      });
    };
    const poller = createPoller({
      ...f,
      matcher: createMatcher(),
      notifier: {
        sendMatches: () =>
          Promise.resolve({ provider: "disabled", sent: false }),
      },
    });
    await poller.runOnce();
    await poller.runOnce();
    assertEquals(requests, 1);
    const retained = (await f.storage.listMatchesForPost("p1"))[0];
    assertEquals(retained.post, saved.post);
    assert(retained.detailRefreshedAt !== saved.detailRefreshedAt);
  } finally {
    f.close();
  }
});

Deno.test("local detail budget queues work without AI calls, partial decisions or source fault notices", async () => {
  const notices: string[] = [];
  const f = await fixture(undefined, (id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  try {
    const availableAt = f.now() + 60000;
    f.source.getPostDetails = (value) =>
      Promise.resolve(
        f.now() < availableAt
          ? {
            ...value,
            detailsComplete: false,
            detailDeferredUntil: availableAt,
          }
          : { ...value, detailsComplete: true },
      );
    await f.run();
    assertEquals(f.calls(), 0);
    const key = await matchingHash(["topic", "p1"]);
    const queued = (await f.store.get(key))!;
    assertEquals(queued.retryAt, availableAt);
    assertEquals(queued.detailAttempts, 0);
    assertEquals(queued.attempts, 0);
    assert(queued.pendingPost);
    assertEquals((await f.store.runtime())?.sourceFailure, undefined);
    f.advance(60000);
    await f.run([]);
    assertEquals(f.calls(), 1);
    assertEquals((await f.store.get(key))?.result, null);
    assertEquals((await f.store.get(key))?.pendingPost, undefined);
    assertEquals(notices, []);
  } finally {
    f.close();
  }
});

Deno.test("deferred refresh retains the complete record and retries without resetting its six hour timer", async () => {
  const f = await fixture();
  try {
    const saved = {
      id: "old-match",
      keyword: "帮助",
      location: "title" as const,
      matchedAt: "2026-01-01T00:00:00Z",
      detailRefreshedAt: "2026-01-01T00:00:00Z",
      post: { ...post(), body: "完整正文", detailsComplete: true },
    };
    await f.storage.saveMatch(saved);
    f.source.listLatestPosts = () => Promise.resolve([post()]);
    f.source.getPostDetails = (value) =>
      Promise.resolve({
        ...value,
        body: "摘要",
        detailsComplete: false,
        detailDeferredUntil: Date.now() + 60000,
      });
    const poller = createPoller({
      ...f,
      matcher: createMatcher(),
      notifier: {
        sendMatches: () =>
          Promise.resolve({ provider: "disabled", sent: false }),
      },
    });
    await poller.runOnce();
    const deferred = (await f.storage.listMatchesForPost("p1"))[0];
    assertEquals(deferred.post.body, "完整正文");
    assertEquals(deferred.detailRefreshedAt, saved.detailRefreshedAt);
    f.source.getPostDetails = (value) =>
      Promise.resolve({
        ...value,
        body: "更新后的完整正文",
        detailsComplete: true,
      });
    await poller.runOnce();
    const refreshed = (await f.storage.listMatchesForPost("p1"))[0];
    assertEquals(refreshed.post.body, "更新后的完整正文");
    assert(refreshed.detailRefreshedAt !== saved.detailRefreshedAt);
  } finally {
    f.close();
  }
});

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
 * @param {(id: string) => Promise<boolean>} notifyAiFailure 故障投递器。
 * @param {(id: string) => Promise<boolean>} notifySourceFailure 来源故障投递器。
 * @return {Promise<object>} 测试上下文。
 */
async function fixture(
  notifyAiFailure: (id: string) => Promise<boolean> = () =>
    Promise.resolve(false),
  notifySourceFailure: (id: string) => Promise<boolean> = () =>
    Promise.resolve(false),
) {
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
      notifyAiFailure,
      notifySourceFailure,
    );
    assert(session);
    try {
      const results = [];
      for (const item of await session.observe(app.topics[0], posts)) {
        results.push(
          await session.findMatch(item, app.topics[0], app.commonKeywordRules),
        );
      }
      await session.completeNotifications();
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
      location: "title",
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
    assertEquals(history[0].kind, "ai");
    assertEquals(history[0].keyword, "");
    assertEquals(history[0].aiReason, "需要帮助");
    assertEquals(history[0].location, "title");
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

Deno.test("poller fails over from Oracle, saves full relay details and sends only one notification", async () => {
  const f = await fixture();
  try {
    let upstreamCalls = 0, oracleCalls = 0, notifications = 0;
    const relaySource: TopicSource = {
      listLatestPosts: () => Promise.resolve([]),
      getPostDetails: (value) => {
        upstreamCalls++;
        return Promise.resolve({
          ...value,
          body: "完整关卡求助正文",
          detailsComplete: true,
        });
      },
    };
    const token = "test-only-relay-integration-token-0000";
    const handler = createDetailRelayHandler({ token, source: relaySource });
    f.source.listLatestPosts = () => Promise.resolve([post()]);
    f.source.getPostDetails = () => {
      oracleCalls++;
      return Promise.reject(new Error("Oracle details unavailable"));
    };
    const source = withDetailFailover(
      f.source,
      withDetailRelay(f.source, {
        url: "https://relay.example/v1/details",
        token,
        fetchFn: (url, init) => handler(new Request(url, init)),
      }),
    );
    f.decide({
      decision: "match",
      reason: "关卡求助",
      location: "body",
      inputTokens: 10,
      outputTokens: 5,
      usageKnown: true,
    });
    const poller = createPoller({
      matcher: createMatcher(),
      storage: f.storage,
      source,
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
    const history = await f.storage.listHistory();
    assertEquals(history.length, 1);
    assertEquals(history[0].post.body, "完整关卡求助正文");
    assertEquals(history[0].post.detailsComplete, true);
    assertEquals(notifications, 1);
    assertEquals(upstreamCalls, 1);
    assertEquals(oracleCalls, 1);
    assertEquals(f.calls(), 1);
    assertEquals((await f.store.runtime())?.sourceFailure, undefined);
  } finally {
    f.close();
  }
});

Deno.test("unparsed detail bodies stay pending and recover through the relay after leaving the feed", async () => {
  const f = await fixture();
  try {
    // 仅推进离线时钟，使保存的重试期限在真实轮询器运行前到期；没有访问外部服务。
    f.advance(Date.now() - 301000 - f.now());
    let recovered = false, notifications = 0;
    const requests: string[] = [];
    /**
     * 模拟原始详情响应，使用真实解析、出口调度、中继和存储逻辑。
     * @param {string} name 出口名称。
     * @return {TopicSource} 无外网请求的可控详情来源。
     */
    const upstream = (name: string): TopicSource => {
      return createHeyboxTopicSource({
        now: () => new Date(f.now()),
        fetchDetail: (id) => {
          requests.push(`${name}:${id}`);
          return Promise.resolve(Response.json({
            status: "ok",
            result: {
              link: {
                linkid: id,
                title: "需要帮助",
                text: name === "backup" && recovered
                  ? { children: [{ text: "完整关卡求助正文" }] }
                  : { unsupported: "未能解析的关卡求助正文" },
                comment_list: [{ text: "必要评论" }],
                reply_list: [{ text: "必要回复" }],
              },
            },
          }));
        },
      });
    };
    const primary = upstream("primary");
    primary.listLatestPosts = () => Promise.resolve([]);
    const token = "test-only-missing-body-relay-token-0000";
    const handler = createDetailRelayHandler({
      token,
      source: upstream("backup"),
      now: f.now,
    });
    const source = withDetailFailover(
      primary,
      withDetailRelay(primary, {
        token,
        url: "https://relay.example/v1/details",
        now: f.now,
        fetchFn: (url, init) => handler(new Request(url, init)),
      }),
      { now: f.now },
    );
    f.source.getPostDetails = source.getPostDetails;
    await f.run();
    const key = await matchingHash(["topic", "p1"]);
    const pending = (await f.store.get(key))!;
    assert(pending.pendingPost);
    assertEquals(pending.result, undefined);
    assertEquals(pending.detailAttempts, 1);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
    assertEquals((await f.storage.listHistory()).length, 0);
    assertEquals(requests, ["primary:p1", "backup:p1"]);

    recovered = true;
    f.advance(Date.now() - f.now());
    f.decide({
      decision: "match",
      reason: "完整正文包含求助",
      location: "body",
      inputTokens: 10,
      outputTokens: 5,
      usageKnown: true,
    });
    const poller = createPoller({
      matcher: createMatcher(),
      storage: f.storage,
      source,
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
    const history = await f.storage.listHistory();
    assertEquals(history.length, 1);
    assertEquals(history[0].post.body, "完整关卡求助正文");
    assertEquals(history[0].post.comments, ["必要评论"]);
    assertEquals(history[0].post.commentReplies, ["必要回复"]);
    assertEquals(history[0].post.detailsComplete, true);
    assert(history[0].notifiedAt);
    assertEquals(notifications, 1);
    assertEquals(requests, [
      "primary:p1",
      "backup:p1",
      "primary:p1",
      "backup:p1",
    ]);
    assertEquals(f.calls(), 2);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
    assertEquals((await f.store.runtime())?.sourceFailure, undefined);
  } finally {
    f.close();
  }
});

Deno.test("cached AI details retain their type and missing legacy locations do not require paid reclassification", async () => {
  const f = await fixture();
  try {
    f.decide({
      decision: "match",
      reason: "标题描述了求助",
      location: "title",
      inputTokens: 10,
      outputTokens: 10,
      usageKnown: true,
    });
    const first = await f.run();
    assertEquals(await f.run(), first);
    assertEquals(f.calls(), 1);
    const entry = await f.store.get(await matchingHash(["topic", "p1"]));
    assert(entry);
    entry.result = { keyword: "AI: 标题描述了求助", location: "body" };
    await f.store.put(entry);
    assertEquals(await f.run(), [{
      kind: "ai",
      keyword: "",
      aiReason: "标题描述了求助",
      location: "unknown",
    }]);
    assertEquals(f.calls(), 1);
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
      kind: "keyword",
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
      location: "title",
      inputTokens: 100,
      outputTokens: 20,
      usageKnown: true,
    });
    assertEquals(await f.run([post("p3", "列表没有关键词")]), [{
      keyword: "求助",
      kind: "keyword",
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

Deno.test("failed calls never become negative results and keep trying AI beyond three attempts", async () => {
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
    assertEquals(f.calls(), 2);
    f.advance(600000);
    await f.run();
    f.advance(1200000);
    await f.run();
    f.advance(3600000);
    await f.run();
    assertEquals(f.calls(), 5);
    const state = await f.store.runtime();
    assertEquals(state?.unknownUsage, 5);
    assertEquals(state?.failures, 5);
    assertEquals(
      (await f.store.get(await matchingHash(["topic", "p1"])))?.result,
      undefined,
    );
    f.app.matching!.apiKey = "replacement";
    await f.run();
    assertEquals(f.calls(), 6);
  } finally {
    f.close();
  }
});

Deno.test("incomplete details classify once without caching a negative result", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    await f.run();
    assertEquals(f.calls(), 1);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
    const key = await matchingHash(["topic", "p1"]);
    assertEquals((await f.store.get(key))?.result, undefined);
    f.advance(900000);
    await f.run();
    assertEquals(f.calls(), 1);
  } finally {
    f.close();
  }
});

Deno.test("persistent detail failures notify once across sessions and days and clear on recovery", async () => {
  const notices: string[] = [];
  const f = await fixture(undefined, (id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    await f.run();
    assertEquals(notices.length, 0);
    f.advance(899999);
    await f.run();
    assertEquals(notices.length, 0);
    f.advance(1);
    await f.run();
    assertEquals(notices.length, 1);
    f.advance(matchingDayMs);
    await f.run();
    assertEquals(notices.length, 1);
    assertEquals((await f.store.runtime())?.sourceFailure?.notified, true);
    f.advance(900000);
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: true });
    await f.run();
    assertEquals((await f.store.runtime())?.sourceFailure, undefined);
    assertEquals((await f.storage.listHistory()).length, 0);
  } finally {
    f.close();
  }
});

Deno.test("failed detail outage notifications retry with the same identity without creating matches", async () => {
  const notices: string[] = [];
  const f = await fixture(undefined, (id) => {
    notices.push(id);
    return Promise.resolve(notices.length > 1);
  });
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    await f.run();
    f.advance(900000);
    await f.run();
    assertEquals((await f.store.runtime())?.sourceFailure?.notified, false);
    f.advance(60000);
    await f.run();
    assertEquals(notices.length, 2);
    assertEquals(notices[0], notices[1]);
    assertEquals((await f.store.runtime())?.sourceFailure?.notified, true);
    assertEquals((await f.storage.listHistory()).length, 0);
  } finally {
    f.close();
  }
});

Deno.test("detail failures cap retries and do not consume insufficient AI attempts", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    const key = await matchingHash(["topic", "p1"]);
    for (let failure = 1; failure <= 12; failure++) {
      await f.run();
      const entry = (await f.store.get(key))!;
      assertEquals(entry.attempts, 0);
      assertEquals(entry.detailAttempts, Math.min(failure, 3));
      assertEquals(entry.retryAt - f.now(), Math.min(failure, 3) * 300000);
      f.advance(entry.retryAt - f.now());
    }
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: true });
    f.decide({
      decision: "insufficient",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    await f.run();
    const entry = (await f.store.get(key))!;
    assertEquals(f.calls(), 2);
    assertEquals(entry.attempts, 1);
    assertEquals(entry.detailAttempts, 0);
    assertEquals(entry.retryAt - f.now(), 300000);
    f.advance(300000);
    f.decide({
      decision: "match",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    assert((await f.run())[0]);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
  } finally {
    f.close();
  }
});

Deno.test("legacy detail failure counts do not freeze the first insufficient AI response", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    await f.run();
    const key = await matchingHash(["topic", "p1"]);
    const entry = (await f.store.get(key))!;
    delete entry.detailAttempts;
    await f.store.put({ ...entry, attempts: 20, retryAt: f.now() + 6000000 });
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: true });
    f.decide({
      decision: "insufficient",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    await f.run([]);
    const updated = (await f.store.get(key))!;
    assertEquals(updated.attempts, 1);
    assertEquals(updated.retryAt - f.now(), 300000);
    assert(updated.retryAt < updated.expiresAt);
  } finally {
    f.close();
  }
});

Deno.test("partial positive AI decisions produce matches while retaining the source warning", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = () => Promise.reject(new Error("unavailable"));
    f.decide({
      decision: "match",
      location: "title",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    assert((await f.run())[0]);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
    assert((await f.store.runtime())?.lastError?.includes("详情"));
  } finally {
    f.close();
  }
});

Deno.test("partial insufficient decisions keep full-detail retries alive and changed text is reconsidered", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    f.decide({
      decision: "insufficient",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    for (let i = 0; i < 5; i++) {
      await f.run();
      f.advance(900000);
    }
    assertEquals(f.calls(), 1);
    const key = await matchingHash(["topic", "p1"]);
    assertEquals((await f.store.get(key))?.insufficient, undefined);
    assertEquals((await f.store.get(key))?.attempts, 0);
    await f.run([post("p1", "补充了求助说明")]);
    assertEquals(f.calls(), 2);
    f.advance(900000);
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: true });
    f.decide({
      decision: "match",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    assert((await f.run([]))[0]);
    assertEquals(f.calls(), 3);
    assertEquals((await f.store.runtime())?.pendingCount, 0);
  } finally {
    f.close();
  }
});

Deno.test("partial content does not turn hybrid keyword misses or AI errors into final decisions", async () => {
  const f = await fixture();
  try {
    f.source.getPostDetails = (value) =>
      Promise.resolve({ ...value, detailsComplete: false });
    f.app.matching!.mode = "hybrid";
    assertEquals(await f.run(), [undefined]);
    assertEquals(f.calls(), 0);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
    f.app.matching!.mode = "ai";
    f.decide({
      error: "AI HTTP 503",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    assertEquals(await f.run([post("p1", "求助")]), [undefined]);
    const entry = (await f.store.get(await matchingHash(["topic", "p1"])))!;
    assertEquals(entry.result, undefined);
    assertEquals(entry.retryAt - f.now(), 300000);
    assertEquals((await f.store.runtime())?.pendingCount, 1);
  } finally {
    f.close();
  }
});

Deno.test("queued AI snapshots keep original fingerprints while continuing AI attempts after truncation", async () => {
  const f = await fixture();
  try {
    f.app.matching!.mode = "ai";
    f.app.commonKeywordRules = [{
      keyword: "不存在的关键词",
      locations: ["body"],
    }];
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
    assertEquals(f.calls(), 5);
    assertEquals(final?.fingerprint, original?.fingerprint);
    assertEquals(final?.lastSeenAt, original?.lastSeenAt);
  } finally {
    f.close();
  }
});

Deno.test("AI errors fall back per post without a circuit, preserve mode, and resume AI decisions", async () => {
  for (const mode of ["ai", "hybrid"] as const) {
    const notices: string[] = [];
    const f = await fixture((id) => {
      notices.push(id);
      return Promise.resolve(true);
    });
    try {
      f.app.matching!.mode = mode;
      f.decide({
        error: "AI HTTP 402",
        inputTokens: 0,
        outputTokens: 0,
        usageKnown: false,
      });
      const results = await f.run([post("p1", "求助"), post("p2", "求助")]);
      assertEquals(results, [
        {
          keyword: "求助",
          location: "body",
          kind: "keyword",
          aiFallback: true,
        },
        {
          keyword: "求助",
          location: "body",
          kind: "keyword",
          aiFallback: true,
        },
      ]);
      assertEquals(f.calls(), 2);
      assertEquals(notices.length, 1);
      assertEquals((await f.store.runtime())?.pendingCount, 0);
      assertEquals(f.app.matching!.mode, mode);
      assertEquals(
        normalizeMatchResult(
          results[0] as import("../models.ts").MatchResult,
          mode,
        ),
        results[0],
      );
      f.decide({
        decision: "no_match",
        inputTokens: 1,
        outputTokens: 1,
        usageKnown: true,
      });
      assertEquals(await f.run([post("p1", "求助"), post("p2", "求助")]), [
        undefined,
        undefined,
      ]);
      assertEquals(f.calls(), 4);
      assertEquals((await f.store.runtime())?.aiFailure, undefined);
      assertEquals(
        (await f.store.get(await matchingHash(["topic", "p1"])))?.result,
        null,
      );
    } finally {
      f.close();
    }
  }
});

Deno.test("AI outage notices survive new sessions, reset daily and reset after a successful AI call", async () => {
  const notices: string[] = [];
  const f = await fixture((id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  const failure = {
    error: "AI HTTP 402",
    inputTokens: 0,
    outputTokens: 0,
    usageKnown: false,
  };
  try {
    f.decide(failure);
    for (let i = 0; i < 4; i++) await f.run();
    assertEquals(f.calls(), 4);
    assertEquals(notices.length, 1);
    assertEquals((await f.store.runtime())?.aiFailure?.notified, true);
    f.advance(matchingDayMs);
    await f.run();
    await f.run();
    assertEquals(notices.length, 2);
    assert(notices[0] !== notices[1]);
    f.decide({
      decision: "no_match",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    await f.run();
    f.decide(failure);
    await f.run([post("p2")]);
    assertEquals(notices.length, 3);
    assertEquals(new Set(notices).size, 3);
  } finally {
    f.close();
  }
});

Deno.test("valid insufficient decisions neither report service faults nor fall back to keyword matches", async () => {
  const notices: string[] = [];
  const f = await fixture((id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  try {
    f.decide({
      decision: "insufficient",
      reason: "信息不足",
      inputTokens: 714,
      outputTokens: 23,
      usageKnown: true,
    });
    const sample = post("p1", "求助");
    assertEquals(await f.run([sample]), [undefined]);
    await f.run([sample]);
    assertEquals(f.calls(), 1);
    const runtime = (await f.store.runtime())!;
    assertEquals(runtime.failures, 0);
    assertEquals(runtime.lastError, undefined);
    assertEquals(runtime.aiFailure, undefined);
    assertEquals(runtime.pendingCount, 1);
    assertEquals(runtime.unknownUsage, 0);
    assertEquals(notices, []);
    f.advance(300000);
    await f.run([sample]);
    f.advance(600000);
    await f.run([sample]);
    f.advance(1200000);
    await f.run([sample]);
    assertEquals(f.calls(), 3);
    const key = await matchingHash(["topic", "p1"]);
    const cached = (await f.store.get(key))!;
    assertEquals(cached.insufficient, true);
    assertEquals(cached.result, undefined);
    assertEquals(await f.store.pending("topic", f.now()), []);
    f.advance(matchingDayMs);
    await f.run([sample]);
    assertEquals(f.calls(), 3);
    assertEquals(notices, []);
    await f.run([post("p1", "求助，补充了内容")]);
    assertEquals(f.calls(), 4);
  } finally {
    f.close();
  }
});

Deno.test("a valid insufficient response clears service outage state and actual HTTP failures still notify", async () => {
  const notices: string[] = [];
  const f = await fixture((id) => {
    notices.push(id);
    return Promise.resolve(true);
  });
  try {
    const failure = {
      error: "AI HTTP 503",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    };
    f.decide(failure);
    await f.run();
    assertEquals(notices.length, 1);
    f.decide({
      decision: "insufficient",
      inputTokens: 2,
      outputTokens: 2,
      usageKnown: true,
    });
    await f.run();
    assertEquals((await f.store.runtime())?.aiFailure, undefined);
    assertEquals((await f.store.runtime())?.lastError, undefined);
    assertEquals((await f.store.runtime())?.failures, 1);
    f.advance(300000);
    f.decide(failure);
    await f.run();
    assertEquals(notices.length, 2);
    assertEquals(
      (await f.store.get(await matchingHash(["topic", "p1"])))?.insufficient,
      undefined,
    );
  } finally {
    f.close();
  }
});

Deno.test("AI retries frozen pending posts even after they leave the feed", async () => {
  const f = await fixture();
  try {
    f.decide({
      error: "AI HTTP 402",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    await f.run();
    const key = await matchingHash(["topic", "p1"]);
    const entry = (await f.store.get(key))!;
    await f.store.put({ ...entry, attempts: 3, retryAt: entry.expiresAt });
    await f.run([]);
    assertEquals(f.calls(), 2);
    assertEquals((await f.store.get(key))?.attempts, 0);
  } finally {
    f.close();
  }
});

Deno.test("failed alert delivery does not block fallback and retries once in a later run", async () => {
  const notices: string[] = [];
  const f = await fixture((id) => {
    notices.push(id);
    if (notices.length === 1) return Promise.reject(new Error("offline"));
    return Promise.resolve(true);
  });
  try {
    f.decide({
      error: "AI HTTP 503",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    const posts = [post("p1", "求助"), post("p2", "求助")];
    assert((await f.run(posts)).every(Boolean));
    assertEquals(notices.length, 1);
    assertEquals((await f.store.runtime())?.aiFailure?.notified, false);
    await f.run(posts);
    await f.run(posts);
    assertEquals(notices.length, 2);
    assertEquals(notices[0], notices[1]);
  } finally {
    f.close();
  }
});

Deno.test("poller merges failure notices into fallback matches without sending an extra fault message", async () => {
  const f = await fixture();
  try {
    let posts = [post("p1", "求助"), post("p2", "没有关键词")];
    f.source.listLatestPosts = () => Promise.resolve(posts);
    f.decide({
      error: "AI HTTP 402",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    const batches: import("../models.ts").MatchRecord[][] = [];
    const alerts: import("./service_notification.ts").ServiceNotification[] =
      [];
    const poller = createPoller({
      ...f,
      matcher: createMatcher(),
      notifier: {
        sendService: (notice) => {
          alerts.push(notice);
          return Promise.resolve({ provider: "webhook", sent: true });
        },
        sendMatches: (records) => {
          batches.push(records);
          return Promise.resolve({ provider: "webhook", sent: true });
        },
      },
    });
    await poller.runOnce();
    await poller.runOnce();
    assertEquals(alerts.length, 0);
    assertEquals(batches.length, 1);
    assertEquals(batches[0].length, 1);
    assertEquals(batches[0][0].aiFallback, true);
    assertEquals(batches[0][0].kind, "keyword");
    assertEquals(
      (await f.storage.listMatchesForPost("p1"))[0].aiFallback,
      true,
    );
    assertEquals(await f.storage.listMatchesForPost("p2"), []);
    f.decide({
      decision: "match",
      reason: "符合提示词",
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    });
    posts = [post("p2", "没有关键词")];
    await poller.runOnce();
    assertEquals(batches.length, 2);
    assertEquals(batches[1][0].kind, "ai");
    assertEquals(batches[1][0].aiFallback, undefined);
    assertEquals((await f.store.runtime())?.aiFailure, undefined);
  } finally {
    f.close();
  }
});

Deno.test("polling sends one complete PushPlus match message and one native match event with fallback text", async () => {
  const f = await fixture();
  try {
    f.app.locale = "zh-CN";
    f.app.notificationProvider = "webhook";
    f.app.notificationWebhookService = "pushPlus";
    f.app.notificationPushPlusToken = "fixture-token";
    let posts = [
      post("miss", "无关正文"),
      post("p1", "求助：请问这一关应该怎么打？"),
    ];
    f.source.listLatestPosts = () => Promise.resolve(posts);
    f.decide({
      error: "AI HTTP 402",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    const requests: { title: string; content: string }[] = [];
    const account = f.storage.forUser("alice");
    const messages = getMessages(f.app.locale);
    let browserCalls = 0;
    const notifier = createPollingNotifier(f.storage, {
      other: () =>
        Promise.resolve(createNotifier({
          deliveryLogger: () => {},
          resolveDns: () => Promise.resolve(["93.184.216.34"]),
          fetch: (_input, init) => {
            requests.push(JSON.parse(String(init?.body)));
            return Promise.resolve(new Response(JSON.stringify({ code: 200 })));
          },
        })),
      browsers: (_storage, _userId, content) => {
        browserCalls++;
        assert(Array.isArray(content));
        assertEquals(content.length, 1);
        assertEquals(content[0].aiFallback, true);
        return Promise.resolve(true);
      },
    });
    const poller = createPoller({ ...f, matcher: createMatcher(), notifier });
    await poller.runOnce(account, f.app);
    assertEquals(requests.length, 1);
    assertEquals(requests[0].title, messages.notificationBatchTitle);
    assert(
      requests[0].content.startsWith(messages.notificationAiFallback + "\n\n"),
    );
    assert(
      requests[0].content.includes(
        "[需要帮助](https://www.xiaoheihe.cn/app/bbs/link/p1)",
      ),
    );
    assert(requests[0].content.includes("请问这一关应该怎么打？"));
    assert(requests[0].content.includes("命中关键词：求助"));
    assert(requests[0].content.includes("匹配位置：正文"));
    assert(requests[0].content.includes("发帖时间："));
    const events = (await account.nativeNotifications!.read("")).events;
    assertEquals(events.length, 1);
    assertEquals(events[0].title, messages.appName);
    assertEquals(
      events[0].body,
      messages.notificationAiFallback + "\n需要帮助",
    );
    assertEquals(events[0].path, "/history");
    assertEquals(
      (await account.matching!.runtime())?.aiFailure?.notified,
      true,
    );
    posts = [post("p2", "求助：第二条帖子")];
    await poller.runOnce(account, f.app);
    assertEquals(requests.length, 2);
    assertEquals(browserCalls, 2);
    assert(
      requests[1].content.startsWith(messages.notificationAiFallback + "\n\n"),
    );
    assert(requests[1].content.includes("第二条帖子"));
    assertEquals(
      (await account.nativeNotifications!.read("")).events.length,
      2,
    );
  } finally {
    f.close();
  }
});

Deno.test("poller only sends standalone failure reminders when no fallback matches exist", async () => {
  const f = await fixture();
  try {
    f.source.listLatestPosts = () =>
      Promise.resolve([post("miss", "无关正文")]);
    f.decide({
      error: "AI HTTP 402",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    let alerts = 0, batches = 0;
    const poller = createPoller({
      ...f,
      matcher: createMatcher(),
      notifier: {
        sendService: () => {
          alerts++;
          return Promise.resolve({ provider: "webhook", sent: true });
        },
        sendMatches: () => {
          batches++;
          return Promise.resolve({ provider: "webhook", sent: true });
        },
      },
    });
    await poller.runOnce();
    await poller.runOnce();
    assertEquals([alerts, batches], [1, 0]);
    const runtime = (await f.store.runtime())!;
    await f.store.saveRuntime({ ...runtime, day: "2000-01-01" });
    await poller.runOnce();
    assertEquals([alerts, batches], [2, 0]);
    assertEquals(await f.storage.listMatchesForPost("miss"), []);
  } finally {
    f.close();
  }
});

Deno.test("failed merged match delivery never sends a body-only fault message in its place", async () => {
  const f = await fixture();
  try {
    f.source.listLatestPosts = () => Promise.resolve([post("p1", "求助")]);
    f.decide({
      error: "AI HTTP 402",
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: false,
    });
    let alerts = 0;
    const poller = createPoller({
      ...f,
      matcher: createMatcher(),
      notifier: {
        sendService: () => {
          alerts++;
          return Promise.resolve({ provider: "webhook", sent: true });
        },
        sendMatches: () =>
          Promise.resolve({ provider: "webhook", sent: false }),
      },
    });
    await poller.runOnce();
    assertEquals(alerts, 0);
    assertEquals((await f.store.runtime())?.aiFailure?.notified, false);
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
