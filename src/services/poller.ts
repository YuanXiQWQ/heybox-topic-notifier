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

      for (const topic of enabledTopics) {
        const posts = await source.listLatestPosts(topic.id);
        const keywordRules = [...settings.commonKeywordRules, ...topic.keywordRules];

        for (const post of posts) {
          const match = matcher.findMatch(post, keywordRules);
          const alreadySeen = await storage.hasSeenPost(post.id);

          if (!match || alreadySeen) {
            continue;
          }

          const matchedAt = new Date().toISOString();
          const record: MatchRecord = {
            id: `${topic.id}:${post.id}:${match.keyword}:${match.location}`,
            keyword: match.keyword,
            location: match.location,
            matchedAt,
            post,
          };

          await storage.saveMatch(record);
          await notifier.sendMatch();
        }
      }

      await storage.setLastPollAt(new Date().toISOString());
    },
  };
}
