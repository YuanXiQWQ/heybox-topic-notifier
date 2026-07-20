/**
 * @file 本文件负责轮询话题帖子、匹配关键词并触发通知。
 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import type { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import type { TopicSource } from "./topic_source.ts";

type PollStorage = Pick<
  ReturnType<typeof createKvStorage>,
  | "getSettings"
  | "listHistory"
  | "markMatchNotified"
  | "saveMatch"
  | "setLastPollAt"
>;

type PollerDependencies = {
  matcher: ReturnType<typeof createMatcher>;
  notifier: ReturnType<typeof createNotifier>;
  source: TopicSource;
  storage: ReturnType<typeof createKvStorage>;
};

export function createPoller({ matcher, notifier, source, storage }: PollerDependencies) {
  return {
    async recordMatches(
      records: MatchRecord[],
      runStorage: PollStorage = storage,
      runSettings?: AppSettings,
    ): Promise<void> {
      const settings = runSettings ?? await runStorage.getSettings();
      await saveAndNotifyMatches(runStorage, notifier, records, settings);
    },

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

          const match = await matcher.findMatch(post, keywordRules);
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

          await saveMatchRecord(runStorage, record);
          matchedRecords.push(record);
          matchedPostIds.add(record.post.id);
          existingMatchedPostIds.add(record.post.id);
        }
      }

      await notifyMatchedRecords(runStorage, notifier, matchedRecords, settings);
      await runStorage.setLastPollAt(new Date().toISOString());
    },
  };
}

async function saveAndNotifyMatches(
  storage: Pick<PollStorage, "markMatchNotified" | "saveMatch">,
  notifier: ReturnType<typeof createNotifier>,
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
  notifier: ReturnType<typeof createNotifier>,
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

async function resolvePostDetails(source: TopicSource, post: MatchRecord["post"]) {
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
