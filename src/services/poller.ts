import type { MatchRecord } from "../models.ts";
import type { createKvStorage } from "../storage/kv.ts";
import type { createMatcher } from "./matcher.ts";
import type { createMockTopicSource } from "./mock_topic_source.ts";
import type { createNotifier } from "./notifier.ts";

type PollerDependencies = {
  matcher: ReturnType<typeof createMatcher>;
  notifier: ReturnType<typeof createNotifier>;
  source: ReturnType<typeof createMockTopicSource>;
  storage: ReturnType<typeof createKvStorage>;
};

export function createPoller({ matcher, notifier, source, storage }: PollerDependencies) {
  return {
    async runOnce(): Promise<void> {
      const settings = await storage.getSettings();
      const posts = await source.listLatestPosts(settings.topicId);

      for (const post of posts) {
        const keyword = matcher.findKeyword(post, settings);
        const alreadySeen = await storage.hasSeenPost(post.id);

        if (!keyword || alreadySeen) {
          continue;
        }

        const matchedAt = new Date().toISOString();
        const record: MatchRecord = {
          id: `${post.id}:${keyword}`,
          keyword,
          matchedAt,
          post,
        };

        await storage.saveMatch(record);
        await notifier.sendMatch();
      }

      await storage.setLastPollAt(new Date().toISOString());
    },
  };
}
