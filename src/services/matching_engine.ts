/** @file 编排三种匹配模式、AI 失败正则回退、连续故障通知和每日用量。 */
import type {
  AppSettings,
  KeywordRule,
  MatchResult,
  TopicPost,
  TopicRule,
} from "../models.ts";
import type {
  MatchingEntry,
  MatchingRuntime,
  MatchingStore,
} from "../storage/matching_types.ts";
import { aiEndpoint, aiPostText, createAiMatcher } from "./ai_matcher.ts";
import type { createMatcher } from "./matcher.ts";
import { matchingDayMs, observeTopic } from "./matching_activity.ts";
import { normalizeMatchResult, shortAiReason } from "./match_result.ts";
import { normalizeMatchingSettings } from "./matching_settings.ts";
import type { TopicSource } from "./topic_source.ts";

/** 未变化列表帖子的详情检查间隔，内容不变时不重复调用 AI。 */
const detailCheckMs = 6 * 3600000;
/** 每轮 AI 工作时间预算；未处理帖子进入有界持久化队列。 */
const aiRunBudgetMs = 40000;

/**
 * 生成不包含明文配置或正文的稳定指纹。
 * @param {unknown} value 可序列化资料。
 * @return {Promise<string>} SHA-256 指纹。
 */
export async function matchingHash(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * 保留缓存状态并按 UTC 日期重置每日调用统计。
 * @param {MatchingRuntime | undefined} previous 已存统计。
 * @param {number} now 当前时间。
 * @return {MatchingRuntime} 本日统计。
 */
export function matchingRuntimeForDay(
  previous: MatchingRuntime | undefined,
  now: number,
): MatchingRuntime {
  const day = new Date(now).toISOString().slice(0, 10);
  if (previous?.day === day) return previous;
  return {
    day,
    calls: 0,
    hits: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    unknownUsage: 0,
    cacheCount: previous?.cacheCount ?? 0,
    pendingCount: previous?.pendingCount ?? 0,
    dropped: 0,
    lastPrunedAt: previous?.lastPrunedAt,
    topics: previous?.topics ?? {},
  };
}

/**
 * 创建持有用户租约的匹配会话，重复轮询无法并发消费额度。
 * @param {AppSettings} app 应用设置。
 * @param {MatchingStore} store 用户缓存。
 * @param {ReturnType<ReturnType<typeof createMatcher>["createSession"]>} rulesMatcher 规则会话。
 * @param {TopicSource} source 帖子数据源。
 * @param {ReturnType<typeof createAiMatcher>} ai AI 分类器。
 * @param {() => number} now 可注入时钟。
 * @param {(id: string) => Promise<boolean>} sendAiFailure 无回退命中可合并时发送故障通知。
 * @return {Promise<object | undefined>} 已获得租约的会话，忙碌时返回 undefined。
 */
export async function startMatchingRun(
  app: AppSettings,
  store: MatchingStore,
  rulesMatcher: ReturnType<ReturnType<typeof createMatcher>["createSession"]>,
  source: TopicSource,
  ai = createAiMatcher(),
  now = Date.now,
  sendAiFailure: (id: string) => Promise<boolean> = () => Promise.resolve(false),
) {
  const token = crypto.randomUUID();
  if (!await store.acquire(token, now())) return undefined;
  let runtime: MatchingRuntime;
  try {
    runtime = matchingRuntimeForDay(await store.runtime(), now());
  } catch (error) {
    await store.release(token);
    throw error;
  }
  const settings = normalizeMatchingSettings(app.matching);
  const startedAt = now();
  const configs = new Map<string, string>();
  const visibleIds = new Map<string, Set<string>>();
  let failedThisRun = false;
  const savedEntries = new Map<string, MatchingEntry | undefined>();
  /**
   * 持久化条目并同步缓存与待处理数量。
   *
   * @param {MatchingEntry} entry 条目。保存前后同步数量，避免每次轮询全表扫描。
   */
  async function saveEntry(entry: MatchingEntry): Promise<void> {
    const previous = savedEntries.get(entry.key);
    await store.put(entry);
    if (!previous) runtime.cacheCount++;
    runtime.pendingCount += Number(Boolean(entry.pendingPost)) -
      Number(Boolean(previous?.pendingPost));
    savedEntries.set(entry.key, { ...entry });
  }
  // 已移除话题的统计不再占用运行快照，但其缓存仍按期限淘汰。
  runtime.topics = Object.fromEntries(
    Object.entries(runtime.topics).filter(([id]) =>
      app.topics.some((topic) => topic.id === id)
    ),
  );

  /**
   * 确认本次运行仍持有用户租约并延长租期。
   */
  async function renew(): Promise<void> {
    if (!await store.renew(token, now())) {
      throw new Error("Matching lease expired");
    }
  }

  /**
   * 为当前帖子执行正则回退，记录故障状态供轮询结束后与命中通知合并。
   * @param {MatchingEntry} entry 待处理缓存。
   * @param {TopicPost} post 实际可用的帖子内容。
   * @param {KeywordRule[]} rules 当前话题规则。
   * @param {string} error 脱敏错误。
   * @return {Promise<MatchResult | undefined>} 带回退标记的正则命中。
   */
  async function fallback(
    entry: MatchingEntry,
    post: TopicPost,
    rules: KeywordRule[],
    error: string,
  ): Promise<MatchResult | undefined> {
    runtime.failures++;
    failedThisRun = true;
    runtime.lastError = error;
    runtime.aiFailure ??= {
      id: `ai-failure:${crypto.randomUUID()}`,
      notified: false,
    };
    // 回退结果不充当 AI 缓存；下一轮仍先尝试模型。
    entry.attempts = 0;
    entry.retryAt = 0;
    delete entry.insufficient;
    const match = await rulesMatcher.findMatch(post, rules);
    if (match) delete entry.pendingPost;
    await saveEntry(entry);
    await store.saveRuntime(runtime);
    return match ? { ...match, kind: "keyword", aiFallback: true } : undefined;
  }

  return {
    /**
     * 在命中通知完成后确认故障已告知；只有没有回退命中通知时才单独提醒。
     * @param {boolean | undefined} fallbackSent 回退通知是否受理；undefined 表示没有回退命中。
     */
    async completeNotifications(fallbackSent?: boolean): Promise<void> {
      const failure = runtime.aiFailure;
      if (!failedThisRun || !failure || failure.notified) return;
      await renew();
      if (fallbackSent !== undefined) {
        failure.notified = fallbackSent;
      } else {
        try {
          failure.notified = await sendAiFailure(failure.id);
        } catch {
          console.warn("AI 故障通知投递失败，后续轮询将重试。");
        }
      }
      await store.saveRuntime(runtime);
    },
    /**
     * 记录成功拉取的列表并追加离开窗口但尚未完成的待处理帖子。
     * @param {TopicRule} topic 话题。
     * @param {TopicPost[]} posts 实际拉取的帖子。
     * @return {Promise<TopicPost[]>} 去重后的待判断列表。
     */
    async observe(topic: TopicRule, posts: TopicPost[]): Promise<TopicPost[]> {
      await renew();
      visibleIds.set(topic.id, new Set(posts.map((post) => post.id)));
      const previous = await store.activity(topic.id);
      runtime.topics[topic.id] = observeTopic(
        previous,
        posts.map((post) => post.id),
        app.polling,
        now(),
      );
      const ids = new Set(posts.map((post) => post.id));
      const pending = await store.pending(topic.id, now());
      const current = new Map(posts.map((post) => [post.id, post]));
      const pendingIds = new Set(pending.map((entry) => entry.postId));
      return [
        ...pending.map((entry) =>
          ids.has(entry.postId)
            ? current.get(entry.postId)!
            : entry.pendingPost!
        ),
        ...posts.filter((post) => !pendingIds.has(post.id)),
      ];
    },

    /**
     * 复用成功判定，AI 故障时回退正则；模型正常返回信息不足时保留待判断。
     * @param {TopicPost} post 列表帖子或待处理快照。
     * @param {TopicRule} topic 话题。
     * @param {KeywordRule[]} rules 当前话题的合并规则。
     * @return {Promise<MatchResult | undefined>} 命中结果，未命中或待处理时无结果。
     */
    async findMatch(
      post: TopicPost,
      topic: TopicRule,
      rules: KeywordRule[],
    ): Promise<MatchResult | undefined> {
      await renew();
      runtime = matchingRuntimeForDay(runtime, now());
      let config = configs.get(topic.id);
      if (!config) {
        config = await matchingHash([
          settings.mode,
          settings.apiUrl,
          settings.apiKey,
          settings.model,
          settings.prompt,
          settings.includeComments,
          settings.disableThinking,
          settings.maxInputChars,
          settings.maxOutputTokens,
          settings.mode === "ai" ? [] : rules,
        ]);
        configs.set(topic.id, config);
      }
      const key = await matchingHash([topic.id, post.id]);
      const old = await store.get(key);
      const queued = Boolean(old?.pendingPost) &&
        !visibleIds.get(topic.id)?.has(post.id);
      const fingerprint = queued ? old!.fingerprint : await matchingHash(
        settings.mode === "ai" ? aiPostText(post, settings) : [
          post.title,
          post.body,
          post.excerpt,
          post.comments,
          post.commentReplies,
        ],
      );
      savedEntries.set(key, old ? { ...old } : undefined);
      const activity = runtime.topics[topic.id];
      const timestamp = now();
      const ttl = (activity?.ttlDays ?? 7) * matchingDayMs;
      const same = old && old.config === config &&
        old.fingerprint === fingerprint;
      const entry: MatchingEntry = same ? { ...old } : {
        key,
        topicId: topic.id,
        postId: post.id,
        config,
        fingerprint,
        lastSeenAt: queued ? old!.lastSeenAt : timestamp,
        expiresAt: timestamp + ttl,
        attempts: 0,
        retryAt: 0,
      };
      // 队列重试不延长已离开真实列表的帖子寿命。
      if (visibleIds.get(topic.id)?.has(post.id)) entry.lastSeenAt = timestamp;
      const live = old && old.expiresAt > timestamp;
      // 兼容把三次失败冻结至过期时间的条目，使仍有效的帖子恢复 AI 尝试。
      if (!entry.insufficient && entry.attempts >= 3 && entry.retryAt === entry.expiresAt) {
        entry.attempts = 0;
        entry.retryAt = 0;
      }
      entry.expiresAt = entry.lastSeenAt + ttl;
      if (live && entry.insufficient && entry.attempts >= 3) {
        entry.retryAt = entry.expiresAt;
      }
      if (activity) activity.checked++;
      if (
        same && live && entry.result !== undefined &&
        (settings.mode === "rules" ||
          timestamp - (entry.detailCheckedAt ?? 0) < detailCheckMs)
      ) {
        runtime.hits++;
        if (activity) activity.hits++;
        await saveEntry(entry);
        return entry.result ? normalizeMatchResult(entry.result, settings.mode) : undefined;
      }
      if (
        same && live && entry.result === undefined &&
        (entry.retryAt > timestamp || (entry.insufficient && entry.attempts >= 3))
      ) {
        await saveEntry(entry);
        return undefined;
      }
      if (!live) {
        entry.attempts = 0;
        entry.retryAt = 0;
      }
      if (settings.mode === "rules") {
        entry.result = await rulesMatcher.findMatch(post, rules) ?? null;
        entry.evaluatedAt = timestamp;
        await saveEntry(entry);
        return entry.result ? normalizeMatchResult(entry.result, settings.mode) : undefined;
      }
      const limited = JSON.parse(aiPostText(post, settings));
      entry.pendingPost = {
        ...post,
        title: limited.title,
        body: limited.body,
        excerpt: limited.excerpt,
        comments: settings.includeComments ? [limited.comments] : [],
        commentReplies: settings.includeComments ? [limited.replies] : [],
        url: post.url.slice(0, 2048),
        id: post.id.slice(0, 200),
      };
      entry.result = undefined;
      if (
        now() - startedAt >= aiRunBudgetMs ||
        runtime.calls >= settings.dailyLimit
      ) {
        entry.retryAt = runtime.calls >= settings.dailyLimit
          ? Date.parse(`${runtime.day}T00:00:00Z`) + matchingDayMs
          : now() + 60000;
        await saveEntry(entry);
        return undefined;
      }
      let detailed = post;
      try {
        if (source.getPostDetails) detailed = await source.getPostDetails(post);
        if (detailed.detailsComplete === false) throw new Error("detail");
      } catch {
        entry.attempts++;
        entry.retryAt = now() + 300000 * entry.attempts;
        runtime.lastError = "帖子详情获取失败，已保留待处理记录。";
        await saveEntry(entry);
        return undefined;
      }
      entry.detailCheckedAt = now();
      const detailedHash = await matchingHash(
        settings.mode === "hybrid"
          ? [
            aiPostText(detailed, settings),
            detailed.title,
            detailed.body,
            detailed.excerpt,
            detailed.comments,
            detailed.commentReplies,
          ]
          : aiPostText(detailed, settings),
      );
      if (
        same && live && old.result !== undefined &&
        old.detailFingerprint === detailedHash
      ) {
        entry.result = old.result;
        delete entry.pendingPost;
        runtime.hits++;
        if (activity) activity.hits++;
        await saveEntry(entry);
        return entry.result ? normalizeMatchResult(entry.result, settings.mode) : undefined;
      }
      entry.detailFingerprint = detailedHash;
      const ruleMatch = settings.mode === "hybrid"
        ? await rulesMatcher.findMatch(detailed, rules)
        : undefined;
      if (settings.mode === "hybrid" && !ruleMatch) {
        entry.result = null;
        entry.evaluatedAt = now();
        delete entry.pendingPost;
        await saveEntry(entry);
        return undefined;
      }
      try {
        aiEndpoint(settings.apiUrl);
        if (!settings.apiKey || !settings.model || !settings.prompt) {
          throw new Error("config");
        }
      } catch {
        return await fallback(
          entry, detailed, rules,
          "请完整配置有效的 AI 接口、密钥、模型和提示词。",
        );
      }
      await renew();
      // 先持久化调用预留和短期退避，进程中断也不会立刻重复消费。
      runtime.calls++;
      runtime.unknownUsage++;
      entry.attempts++;
      entry.retryAt = now() + 300000 * 2 ** (entry.attempts - 1);
      await saveEntry(entry);
      await store.saveRuntime(runtime);
      const decision = await ai.classify(detailed, settings);
      runtime.inputTokens += decision.inputTokens;
      runtime.outputTokens += decision.outputTokens;
      if (decision.usageKnown) runtime.unknownUsage--;
      if (decision.error || !decision.decision) {
        return await fallback(
          entry, detailed, rules,
          decision.error ?? "AI 返回的分类格式无效。",
        );
      }
      // 合法的分类响应说明接口可用；信息不足不是服务故障，也不是未命中。
      runtime.lastError = undefined;
      delete runtime.aiFailure;
      if (decision.decision === "insufficient") {
        entry.insufficient = true;
        if (entry.attempts >= 3) entry.retryAt = entry.expiresAt;
        await saveEntry(entry);
        await store.saveRuntime(runtime);
        return undefined;
      } else {
        delete entry.insufficient;
        entry.result = decision.decision === "match"
          ? ruleMatch ??
            { kind: "ai", keyword: "", aiReason: shortAiReason(decision.reason || "符合匹配提示词"), location: decision.location ?? "unknown" }
          : null;
        entry.evaluatedAt = now();
        entry.attempts = 0;
        entry.retryAt = 0;
        delete entry.pendingPost;
      }
      await saveEntry(entry);
      await store.saveRuntime(runtime);
      return entry.result ? normalizeMatchResult(entry.result, settings.mode) : undefined;
    },

    /** 保存统计、清理过期和超量缓存，并释放本次租约。 */
    async close(): Promise<void> {
      try {
        await renew();
        for (const topic of app.topics) {
          const activity = runtime.topics[topic.id];
          if (
            activity?.previousIds.length ||
            activity?.lastObservedAt >= startedAt
          ) await store.saveActivity(topic.id, activity);
        }
        if (
          !runtime.lastPrunedAt || now() - runtime.lastPrunedAt >= 3600000 ||
          runtime.cacheCount > settings.cacheMaxEntries ||
          runtime.pendingCount > 200
        ) {
          const counts = await store.prune(now(), settings.cacheMaxEntries);
          runtime.cacheCount = counts.count;
          runtime.pendingCount = counts.pending;
          runtime.dropped += counts.dropped;
          runtime.lastPrunedAt = now();
        }
        await store.saveRuntime(runtime);
      } finally {
        await store.release(token);
      }
    },
  };
}
