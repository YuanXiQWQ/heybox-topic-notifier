import type { AppSettings, TopicPost } from "../models.ts";

export function createMatcher() {
  return {
    findKeyword(post: TopicPost, settings: AppSettings): string | undefined {
      const haystack = `${post.title}\n${post.excerpt}`.toLocaleLowerCase();
      return settings.keywords.find((keyword) => haystack.includes(keyword.toLocaleLowerCase()));
    },
  };
}
