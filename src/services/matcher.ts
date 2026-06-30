import type { AppSettings, MatchLocation, TopicPost } from "../models.ts";

export type KeywordMatch = {
  keyword: string;
  location: MatchLocation;
};

export function createMatcher() {
  return {
    findMatch(post: TopicPost, settings: AppSettings): KeywordMatch | undefined {
      for (const rule of settings.keywordRules) {
        const keyword = rule.keyword.trim();

        if (!keyword) {
          continue;
        }

        for (const location of rule.locations) {
          if (
            locationText(post, location).toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
          ) {
            return { keyword, location };
          }
        }
      }

      return undefined;
    },
  };
}

function locationText(post: TopicPost, location: MatchLocation): string {
  switch (location) {
    case "title":
      return post.title;
    case "body":
      return `${post.excerpt}\n${post.body}`;
    case "comments":
      return post.comments.join("\n");
    case "replies":
      return post.commentReplies.join("\n");
  }
}
