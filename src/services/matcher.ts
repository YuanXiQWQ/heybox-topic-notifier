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
 * 单次正则匹配允许占用的最长时间。
 */
const regexMatchTimeoutMs = 100;

/**
 * 正则 Worker 执行代码。
 *
 * 正则必须在独立 Worker 中运行，避免灾难性回溯阻塞主线程。
 */
const regexWorkerSource = `
self.onmessage = (event) => {
  const { pattern, flags, text } = event.data;

  try {
    const matched = new RegExp(pattern, flags).test(text);
    self.postMessage({ status: "completed", matched });
  } catch (error) {
    self.postMessage({
      status: "invalid",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
`;

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
    async findMatch(
      post: TopicPost,
      keywordRules: KeywordRule[],
    ): Promise<KeywordMatch | undefined> {
      for (const rule of keywordRules) {
        const keyword = rule.keyword.trim();

        if (!keyword) {
          continue;
        }

        for (const location of rule.locations) {
          if (await matchesKeyword(locationText(post, location), keyword, rule)) {
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
async function matchesKeyword(
  text: string,
  keyword: string,
  rule: KeywordRule,
): Promise<boolean> {
  if (rule.useRegex) {
    return await matchesRegexWithTimeout(
      text,
      keyword,
      rule.caseSensitive ? "" : "i",
    );
  }

  if (rule.caseSensitive) {
    return text.includes(keyword);
  }

  return text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

/**
 * 在独立 Worker 中限时执行正则匹配。
 *
 * 原生 RegExp 是同步操作，不能通过 Promise.race 在主线程中可靠超时。
 * Worker 超时后会被立即终止，因此任意合法 JavaScript 正则都可以使用，
 * 同时不会因灾难性回溯长期阻塞轮询线程。
 *
 * @param text 待匹配文本。
 * @param pattern 正则表达式文本。
 * @param flags 正则标志。
 * @return 正则命中时返回 true；未命中、语法无效或超时时返回 false。
 */
function matchesRegexWithTimeout(
  text: string,
  pattern: string,
  flags: string,
): Promise<boolean> {
  const workerUrl = URL.createObjectURL(
    new Blob([regexWorkerSource], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl, { type: "module" });

  return new Promise((resolve) => {
    let settled = false;

    const finish = (matched: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(matched);
    };

    const timeoutId = setTimeout(() => finish(false), regexMatchTimeoutMs);

    worker.onmessage = (event: MessageEvent) => {
      finish(event.data?.status === "completed" && event.data.matched === true);
    };
    worker.onerror = () => finish(false);
    worker.postMessage({ flags, pattern, text });
  });
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
