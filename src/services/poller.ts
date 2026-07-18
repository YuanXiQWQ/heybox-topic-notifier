/**
 * @file 本文件负责轮询话题帖子、匹配关键词并触发通知。
 */
import type { MatchRecord } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import type { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import type { TopicSource } from "./topic_source.ts";

/**
 * 轮询流程需要使用的存储能力集合。
 */
type PollStorage = Pick<
  ReturnType<typeof createKvStorage>,
  | "getSettings"
  | "listHistory"
  | "markMatchNotified"
  | "saveMatch"
  | "setLastPollAt"
>;

/**
 * 创建轮询器所需的依赖。
 */
type PollerDependencies = {
  matcher: ReturnType<typeof createMatcher>;
  notifier: ReturnType<typeof createNotifier>;
  source: TopicSource;
  storage: ReturnType<typeof createKvStorage>;
};

/**
 * 创建帖子轮询器。
 *
 * @param dependencies 轮询器依赖的匹配器、通知器、数据源和存储。
 * @return 包含单次轮询方法的轮询器对象。
 */
export function createPoller({ matcher, notifier, source, storage }: PollerDependencies) {
  return {
    /**
     * 执行一次话题帖子轮询。
     *
     * @param runStorage 本次轮询使用的存储实现，默认使用创建轮询器时传入的存储。
     * @return 轮询流程完成后的 Promise。
     */
    async runOnce(runStorage: PollStorage = storage): Promise<void> {
      const settings = await runStorage.getSettings();
      const enabledTopics = settings.topics.filter((topic) => topic.enabled && topic.id.trim());
      const existingMatchesByPostId = matchesByPostId(await runStorage.listHistory());
      const existingMatchedPostIds = new Set(existingMatchesByPostId.keys());
      const matchedRecords: MatchRecord[] = [];
      const matchedPostIds = new Set<string>();
      const matchedAt = new Date().toISOString();

      for (const topic of enabledTopics) {
        const posts = await source.listLatestPosts(topic.id, {
          limit: settings.polling.postLimit,
          sort: settings.polling.sort,
        });
        const keywordRules = [...settings.commonKeywordRules, ...topic.keywordRules];

        for (const post of posts) {
          const alreadyMatched = existingMatchedPostIds.has(post.id);

          if (alreadyMatched) {
            const refreshedPost = await resolvePostDetails(source, post);
            await updateExistingMatchesPost(
              runStorage,
              existingMatchesByPostId.get(post.id) ?? [],
              refreshedPost,
            );
            continue;
          }

          const match = matcher.findMatch(post, keywordRules);
          if (!match || matchedPostIds.has(post.id)) {
            continue;
          }

          const detailedPost = await resolvePostDetails(source, post);
          const record: MatchRecord = {
            id: `${topic.id}:${detailedPost.id}:${match.keyword}:${match.location}`,
            keyword: match.keyword,
            location: match.location,
            matchedAt,
            post: detailedPost,
          };

          await runStorage.saveMatch(record);
          matchedRecords.push(record);
          matchedPostIds.add(record.post.id);
          existingMatchedPostIds.add(record.post.id);
        }
      }

      if (matchedRecords.length > 0) {
        const result = await notifier.sendMatches(matchedRecords, settings);
        const notifiedAt = new Date().toISOString();

        for (const record of matchedRecords) {
          if (result.sent) {
            await runStorage.markMatchNotified(record.id, notifiedAt);
          }
        }
      }

      await runStorage.setLastPollAt(new Date().toISOString());
    },
  };
}

/**
 * 尝试补全帖子详情。
 *
 * @param source 话题帖子数据源。
 * @param post 待补全的帖子。
 * @return 补全后的帖子，数据源不支持详情时返回原帖子。
 */
async function resolvePostDetails(source: TopicSource, post: MatchRecord["post"]) {
  return source.getPostDetails ? await source.getPostDetails(post) : post;
}

/**
 * 将历史命中记录按帖子 ID 分组。
 *
 * @param records 历史命中记录列表。
 * @return 以帖子 ID 为键的命中记录映射。
 */
function matchesByPostId(records: MatchRecord[]): Map<string, MatchRecord[]> {
  const result = new Map<string, MatchRecord[]>();

  for (const record of records) {
    const recordsWithPostId = result.get(record.post.id) ?? [];
    recordsWithPostId.push(record);
    result.set(record.post.id, recordsWithPostId);
  }

  return result;
}

/**
 * 更新既有命中记录中的帖子快照。
 *
 * @param storage 用于保存命中记录的存储能力。
 * @param records 需要检查更新的既有命中记录。
 * @param post 最新帖子快照。
 * @return 更新完成后的 Promise。
 */
async function updateExistingMatchesPost(
  storage: Pick<PollStorage, "saveMatch">,
  records: MatchRecord[],
  post: MatchRecord["post"],
): Promise<void> {
  for (const record of records) {
    if (JSON.stringify(record.post) === JSON.stringify(post)) {
      continue;
    }

    await storage.saveMatch({ ...record, post });
  }
}
