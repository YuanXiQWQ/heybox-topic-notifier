/**
 * @file 本文件负责轮询话题帖子、执行规则或 AI 匹配并触发通知。
 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { MatchedPostIndexEntry, Storage } from "../storage/types.ts";
import type { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import type { TopicSource } from "./topic_source.ts";
import { startMatchingRun } from "./matching_engine.ts";
import { normalizeMatchingSettings } from "./matching_settings.ts";
import { createAiMatcher } from "./ai_matcher.ts";

type PollStorage = Pick<
  Storage,
  | "getSettings"
  | "matching"
  | "listMatchedPostIndex"
  | "listMatchesForPost"
  | "markMatchNotified"
  | "saveMatch"
  | "setLastPollAt"
>;

/**
 * 已命中帖子的详情刷新间隔。
 */
export const postDetailRefreshIntervalMs = 6 * 60 * 60 * 1000;

type PollNotifier = Pick<ReturnType<typeof createNotifier>, "sendMatches">;

type PollerDependencies = {
  ai?: ReturnType<typeof createAiMatcher>;
  matcher: ReturnType<typeof createMatcher>;
  notifier: PollNotifier;
  source: TopicSource;
  storage: Storage;
};

/**
 * 创建话题轮询器。
 *
 * @param {PollerDependencies} dependencies 匹配、通知、数据源和存储依赖。
 * @return {object} 支持正式轮询和模拟记录的轮询器。
 */
export function createPoller(
  { matcher, notifier, source, storage, ai = createAiMatcher() }: PollerDependencies,
) {
  return {
    /**
     * 保存并通知一组外部构造的命中记录。
     *
     * @param {MatchRecord[]} records 命中记录。
     * @param {PollStorage} runStorage 本次操作使用的用户存储。
     * @param {AppSettings} runSettings 本次操作使用的应用设置。
     * @return {Promise<void>} 记录和通知完成后的 Promise。
     */
    async recordMatches(
      records: MatchRecord[],
      runStorage: PollStorage = storage,
      runSettings?: AppSettings,
    ): Promise<void> {
      const settings = runSettings ?? await runStorage.getSettings();
      await saveAndNotifyMatches(runStorage, notifier, records, settings);
    },

    /**
     * 执行话题查询、缓存或模型判定和通知；同一用户的缓存轮询由持久化租约串行化。
     *
     * @param {PollStorage} runStorage 本次轮询使用的用户存储。
     * @param {AppSettings} runSettings 同一次调度已读取的设置。
     * @return {Promise<void>} 本次轮询完成后的 Promise。
     */
    async runOnce(
      runStorage: PollStorage = storage,
      runSettings?: AppSettings,
    ): Promise<void> {
      const settings = runSettings ?? await runStorage.getSettings();
      const enabledTopics = settings.topics.filter((topic) =>
        topic.enabled && topic.id.trim()
      );
      const matchedPostIndex = new Map<string, MatchedPostIndexEntry>();
      const indexedPostIds = new Set<string>();
      const matchedRecords: MatchRecord[] = [];
      const matchedPostIds = new Set<string>();
      const runAt = new Date().toISOString();
      const matching = matcher.createSession();
      let cached: Awaited<ReturnType<typeof startMatchingRun>>;

      try {
        if (runStorage.matching) {
          cached = await startMatchingRun(
            settings, runStorage.matching, matching, source, ai,
          );
          if (!cached) return;
        } else if (normalizeMatchingSettings(settings.matching).mode !== "rules") {
          throw new Error("AI matching requires persistent cache storage");
        }
        for (const topic of enabledTopics) {
          let posts = await source.listLatestPosts(topic.id, {
            limit: settings.polling.postLimit,
            sort: settings.polling.sort,
          });
          if (cached) posts = await cached.observe(topic, posts);
          const postIds = [...new Set(posts.map((post) => post.id))]
            .filter((id) => !indexedPostIds.has(id));
          if (postIds.length > 0) {
            for (
              const entry of await runStorage.listMatchedPostIndex(postIds)
            ) {
              matchedPostIndex.set(entry.postId, { ...entry });
            }
            for (const id of postIds) indexedPostIds.add(id);
          }
          const keywordRules = [
            ...settings.commonKeywordRules,
            ...topic.keywordRules,
          ];

          for (const post of posts) {
            const matchedPost = matchedPostIndex.get(post.id);

            if (matchedPost) {
              if (
                shouldRefreshPostDetails(matchedPost.detailRefreshedAt, runAt)
              ) {
                const refreshedPost = await resolvePostDetails(source, post);
                await refreshMatchedPostRecords(
                  runStorage,
                  await runStorage.listMatchesForPost(post.id),
                  refreshedPost,
                  runAt,
                );
                matchedPost.detailRefreshedAt = runAt;
              }
              continue;
            }

            const match = cached
              ? await cached.findMatch(post, topic, keywordRules)
              : await matching.findMatch(post, keywordRules);
            if (!match || matchedPostIds.has(post.id)) {
              continue;
            }

            const detailedPost = await resolvePostDetails(source, post);
            const record: MatchRecord = {
              detailRefreshedAt: runAt,
              id:
                `${topic.id}:${detailedPost.id}:${match.keyword}:${match.location}`,
              keyword: match.keyword,
              location: match.location,
              matchedAt: runAt,
              post: detailedPost,
            };

            await saveMatchRecord(runStorage, record);
            matchedRecords.push(record);
            matchedPostIds.add(record.post.id);
            matchedPostIndex.set(record.post.id, {
              detailRefreshedAt: runAt,
              postId: record.post.id,
            });
          }
        }

        try {
          await notifyMatchedRecords(
            runStorage,
            notifier,
            matchedRecords,
            settings,
          );
        } finally {
          // 帖子查询和记录保存已经完成时，即使通知失败也要推进轮询倒计时。
          await runStorage.setLastPollAt(new Date().toISOString());
        }
      } finally {
        matching.close();
        await cached?.close();
      }
    },
  };
}

async function saveAndNotifyMatches(
  storage: Pick<PollStorage, "markMatchNotified" | "saveMatch">,
  notifier: PollNotifier,
  records: MatchRecord[],
  settings: AppSettings,
): Promise<void> {
  for (const record of records) {
    await saveMatchRecord(storage, record);
  }

  await notifyMatchedRecords(storage, notifier, records, settings);
}

async function saveMatchRecord(
  storage: Pick<PollStorage, "saveMatch">,
  record: MatchRecord,
): Promise<void> {
  await storage.saveMatch(record);
}

async function notifyMatchedRecords(
  storage: Pick<PollStorage, "markMatchNotified">,
  notifier: PollNotifier,
  records: MatchRecord[],
  settings: AppSettings,
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const result = await notifier.sendMatches(records, settings);
  const notifiedAt = new Date().toISOString();

  for (const record of records) {
    if (result.sent) {
      await storage.markMatchNotified(record.id, notifiedAt);
    }
  }
}

async function resolvePostDetails(
  source: TopicSource,
  post: MatchRecord["post"],
) {
  return source.getPostDetails ? await source.getPostDetails(post) : post;
}

/**
 * 判断已命中帖子的详情是否需要重新抓取。
 *
 * @param detailRefreshedAt 上次详情刷新时间。
 * @param now 本次轮询时间。
 * @return 超过刷新间隔或从未刷新时返回 true。
 */
function shouldRefreshPostDetails(
  detailRefreshedAt: string | undefined,
  now: string,
): boolean {
  const refreshedTime = Date.parse(detailRefreshedAt ?? "");
  if (!Number.isFinite(refreshedTime)) {
    return true;
  }

  return Date.parse(now) - refreshedTime >= postDetailRefreshIntervalMs;
}

/**
 * 用最新帖子详情覆盖已命中记录，并记录刷新时间。
 *
 * @param storage 目标存储。
 * @param records 该帖子的已有命中记录。
 * @param post 最新帖子详情。
 * @param refreshedAt 本次刷新时间。
 * @return 更新完成后的 Promise。
 */
async function refreshMatchedPostRecords(
  storage: Pick<PollStorage, "saveMatch">,
  records: MatchRecord[],
  post: MatchRecord["post"],
  refreshedAt: string,
): Promise<void> {
  for (const record of records) {
    await storage.saveMatch({
      ...record,
      detailRefreshedAt: refreshedAt,
      post,
    });
  }
}
