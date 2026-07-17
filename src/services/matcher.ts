/**
 * @file 本文件提供帖子关键词匹配能力。
 */
import type { KeywordRule, MatchLocation, TopicPost } from "../models.ts";

/**
 * 关键词命中结果。
 */
export type KeywordMatch = {
  keyword: string;
  location: MatchLocation;
};

/**
 * 创建关键词匹配器。
 *
 * @return 包含帖子关键词匹配方法的匹配器对象。
 */
export function createMatcher() {
  return {
    /**
     * 根据关键词规则查找帖子中的第一个命中位置。
     *
     * @param post 待匹配的话题帖子。
     * @param keywordRules 需要应用的关键词规则列表。
     * @return 第一个命中结果，未命中时返回 undefined。
     */
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

/**
 * 判断文本是否命中指定关键词规则。
 *
 * @param text 待匹配文本。
 * @param keyword 待匹配关键词。
 * @param rule 关键词匹配规则。
 * @return 命中时返回 true，否则返回 false。
 */
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

/**
 * 按匹配位置提取帖子中对应的文本。
 *
 * @param post 待提取文本的话题帖子。
 * @param location 需要提取的匹配位置。
 * @return 指定位置对应的文本内容。
 */
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
