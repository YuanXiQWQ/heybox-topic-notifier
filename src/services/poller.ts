/**
 * @file 本文件负责轮询话题帖子、匹配关键词并触发通知。
 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import type { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import type { TopicSource } from "./topic_source.ts";

type PollStorage = Pick<
  Storage,
  | "getSettings"
  | "listHistory"
  | "markMatchNotified"
  | "saveMatch"
  | "setLastPollAt"
>;

type PollNotifier = Pick<ReturnType<typeof createNotifier>, "sendMatches">;

type PollerDependencies = {
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
  { matcher, notifier, source, storage }: PollerDependencies,
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
     * 执行一次完整话题查询、匹配和通知。
     *
     * @param {PollStorage} runStorage 本次轮询使用的用户存储。
     * @return {Promise<void>} 本次轮询完成后的 Promise。
     */
    async runOnce(runStorage: PollStorage = storage): Promise<void> {
      const settings = await runStorage.getSettings();
      const enabledTopics = settings.topics.filter((topic) =>
        topic.enabled && topic.id.trim()
      );
      const existingMatchesByPostId = matchesByPostId(
        await runStorage.listHistory(),
      );
      const existingMatchedPostIds = new Set(existingMatchesByPostId.keys());
      const matchedRecords: MatchRecord[] = [];
      const matchedPostIds = new Set<string>();
      const matchedAt = new Date().toISOString();

      for (const topic of enabledTopics) {
        const posts = await source.listLatestPosts(topic.id, {
          limit: settings.polling.postLimit,
          sort: settings.polling.sort,
        });
        const keywordRules = [
          ...settings.commonKeywordRules,
          ...topic.keywordRules,
        ];

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

          const match = await matcher.findMatch(post, keywordRules);
          if (!match || matchedPostIds.has(post.id)) {
            continue;
          }

          const detailedPost = await resolvePostDetails(source, post);
          const record: MatchRecord = {
            id:
              `${topic.id}:${detailedPost.id}:${match.keyword}:${match.location}`,
            keyword: match.keyword,
            location: match.location,
            matchedAt,
            post: detailedPost,
          };

          await saveMatchRecord(runStorage, record);
          matchedRecords.push(record);
          matchedPostIds.add(record.post.id);
          existingMatchedPostIds.add(record.post.id);
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

function matchesByPostId(records: MatchRecord[]): Map<string, MatchRecord[]> {
  const result = new Map<string, MatchRecord[]>();

  for (const record of records) {
    const recordsWithPostId = result.get(record.post.id) ?? [];
    recordsWithPostId.push(record);
    result.set(record.post.id, recordsWithPostId);
  }

  return result;
}

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
