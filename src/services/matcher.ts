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
 * 正则关键词允许的最大长度。
 */
const maxRegexKeywordLength = 120;
/**
 * 正则显式重复次数允许的最大上限。
 */
const maxRegexRepetitionCount = 100;

/**
 * 正则分组中用于判断回溯风险的结构信息。
 */
type RegexGroupInfo = {
  hasAlternation: boolean;
  hasQuantifier: boolean;
};

/**
 * 正则量词解析结果。
 */
type RegexQuantifier = {
  length: number;
  safe: boolean;
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
      if (!isSafeKeywordRegex(keyword)) {
        return false;
      }

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
 * 判断用户输入的正则关键词是否位于允许的安全子集内。
 *
 * @param pattern 用户输入的正则表达式文本。
 * @return 正则表达式文本可安全执行时返回 true。
 */
export function isSafeKeywordRegex(pattern: string): boolean {
  if (pattern.length > maxRegexKeywordLength) {
    return false;
  }

  const groups: RegexGroupInfo[] = [];
  let inCharacterClass = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === "\\") {
      if (isBackreferenceEscape(pattern, index)) {
        return false;
      }
      index += 1;
      continue;
    }

    if (inCharacterClass) {
      if (char === "]") {
        inCharacterClass = false;
      }
      continue;
    }

    if (char === "[") {
      inCharacterClass = true;
      continue;
    }

    if (char === "(") {
      if (pattern[index + 1] === "?") {
        if (pattern[index + 2] !== ":") {
          return false;
        }
        index += 2;
      }
      groups.push({ hasAlternation: false, hasQuantifier: false });
      continue;
    }

    if (char === ")") {
      const group = groups.pop();
      if (!group) {
        return false;
      }

      const quantifier = regexQuantifierAt(pattern, index + 1);
      if (quantifier) {
        if (!quantifier.safe || group.hasAlternation || group.hasQuantifier) {
          return false;
        }
        markCurrentGroupQuantified(groups);
        index += quantifier.length;
      }
      continue;
    }

    if (char === "|") {
      markCurrentGroupAlternated(groups);
      continue;
    }

    const quantifier = regexQuantifierAt(pattern, index);
    if (quantifier) {
      if (!quantifier.safe) {
        return false;
      }
      markCurrentGroupQuantified(groups);
      index += quantifier.length - 1;
    }
  }

  return !inCharacterClass && groups.length === 0;
}

/**
 * 判断当前位置的转义序列是否为回溯引用。
 *
 * @param pattern 正则表达式文本。
 * @param index 反斜杠所在位置。
 * @return 当前位置为回溯引用时返回 true。
 */
function isBackreferenceEscape(pattern: string, index: number): boolean {
  const next = pattern[index + 1] ?? "";
  return /^[1-9]$/.test(next) || (next === "k" && pattern[index + 2] === "<");
}

/**
 * 从指定位置解析正则量词。
 *
 * @param pattern 正则表达式文本。
 * @param index 待解析位置。
 * @return 量词解析结果，不存在量词时返回 undefined。
 */
function regexQuantifierAt(pattern: string, index: number): RegexQuantifier | undefined {
  const char = pattern[index];
  if (char === "*" || char === "+" || char === "?") {
    return { length: pattern[index + 1] === "?" ? 2 : 1, safe: true };
  }

  if (char !== "{") {
    return undefined;
  }

  const match = pattern.slice(index).match(/^\{(\d+)(?:,(\d*))?}\??/);
  if (!match) {
    return undefined;
  }

  const lowerBound = Number(match[1]);
  const upperBound = match[2] === undefined || match[2] === "" ? lowerBound : Number(match[2]);
  const safe = Number.isSafeInteger(lowerBound) &&
    Number.isSafeInteger(upperBound) &&
    lowerBound <= upperBound &&
    lowerBound <= maxRegexRepetitionCount &&
    upperBound <= maxRegexRepetitionCount;
  return { length: match[0].length, safe };
}

/**
 * 标记当前正则分组中出现了分支。
 *
 * @param groups 当前未闭合的正则分组栈。
 */
function markCurrentGroupAlternated(groups: RegexGroupInfo[]): void {
  const currentGroup = groups.at(-1);
  if (currentGroup) {
    currentGroup.hasAlternation = true;
  }
}

/**
 * 标记当前正则分组中出现了量词。
 *
 * @param groups 当前未闭合的正则分组栈。
 */
function markCurrentGroupQuantified(groups: RegexGroupInfo[]): void {
  const currentGroup = groups.at(-1);
  if (currentGroup) {
    currentGroup.hasQuantifier = true;
  }
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
