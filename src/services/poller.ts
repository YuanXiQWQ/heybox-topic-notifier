import type { MatchRecord } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import type { createMatcher } from "./matcher.ts";
import type { createNotifier } from "./notifier.ts";
import type { TopicSource } from "./topic_source.ts";

type PollerDependencies = {
  matcher: ReturnType<typeof createMatcher>;
  notifier: ReturnType<typeof createNotifier>;
  source: TopicSource;
  storage: ReturnType<typeof createKvStorage>;
};

export function createPoller({ matcher, notifier, source, storage }: PollerDependencies) {
  return {
    async runOnce(): Promise<void> {
      const settings = await storage.getSettings();
      const enabledTopics = settings.topics.filter((topic) => topic.enabled && topic.id.trim());
      const existingMatchedPostIds = new Set(
        (await storage.listHistory()).map((record) => record.post.id),
      );
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
          const match = matcher.findMatch(post, keywordRules);
          const alreadyMatched = existingMatchedPostIds.has(post.id);

          if (!match || alreadyMatched || matchedPostIds.has(post.id)) {
            continue;
          }

          const record: MatchRecord = {
            id: `${topic.id}:${post.id}:${match.keyword}:${match.location}`,
            keyword: match.keyword,
            location: match.location,
            matchedAt,
            post,
          };

          await storage.saveMatch(record);
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
            await storage.markMatchNotified(record.id, notifiedAt);
          }
        }
      }

      await storage.setLastPollAt(new Date().toISOString());
    },
  };
}
