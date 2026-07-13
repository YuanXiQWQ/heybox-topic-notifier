import type { KeywordRule, MatchLocation, TopicPost } from "../models.ts";

export type KeywordMatch = {
  keyword: string;
  location: MatchLocation;
};

export function createMatcher() {
  return {
    findMatch(post: TopicPost, keywordRules: KeywordRule[]): KeywordMatch | undefined {
      for (const rule of keywordRules) {
        const keyword = rule.keyword.trim();

        if (!keyword) {
          continue;
        }

        for (const location of rule.locations) {
          if (matchesKeyword(locationText(post, location), keyword, rule)) {
            return { keyword, location };
          }
        }
      }

      return undefined;
    },
  };
}

function matchesKeyword(text: string, keyword: string, rule: KeywordRule): boolean {
  if (rule.useRegex) {
    try {
      return new RegExp(keyword, rule.caseSensitive ? "" : "i").test(text);
    } catch {
      return false;
    }
  }

  if (rule.caseSensitive) {
    return text.includes(keyword);
  }

  return text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
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
