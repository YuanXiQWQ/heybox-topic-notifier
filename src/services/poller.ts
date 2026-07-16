import type { MatchRecord } from "../models.ts";
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
