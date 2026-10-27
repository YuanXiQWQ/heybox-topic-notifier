/**
 * @file 本文件提供关键词匹配会话，复用文本和正则 Worker 并隔离超时计算。
 */
import type { KeywordRule, MatchLocation, TopicPost } from "../models.ts";

/** 首条命中规则及其匹配位置。 */
export type KeywordMatch = { keyword: string; location: MatchLocation };
/** 单条正则匹配的最长等待时间。 */
const regexMatchTimeoutMs = 100;
/** Worker 内缓存当前会话的正则，主线程负责逐次超时与终止。 */
const regexWorkerSource = `
/** 当前会话已编译的正则。 */
const patterns = new Map();
/**
 * 编译或复用正则并执行匹配，语法错误作为未命中返回。
 * @param {MessageEvent} event 正则、标志与待匹配文本。
 */
self.onmessage = (event) => {
  const { pattern, flags, text } = event.data;
  const key = JSON.stringify([pattern, flags]);
  try {
    if (!patterns.has(key)) patterns.set(key, new RegExp(pattern, flags));
    self.postMessage({ matched: patterns.get(key).test(text) });
  } catch {
    self.postMessage({ matched: false });
  }
};
`;
/** 可注入的 Worker 工厂，用于验证资源数量和异常路径。 */
type MatcherOptions = { createWorker?: (url: string) => Worker };
/** 会话内复用的规范化规则。 */
type PreparedRule = {
  keyword: string;
  lowerKeyword: string;
  caseSensitive: boolean;
  useRegex: boolean;
  locations: MatchLocation[];
};

/**
 * 创建支持独立调用和轮询会话的关键词匹配器。
 *
 * @param {MatcherOptions} options Worker 创建依赖。
 * @return {object} 单次匹配方法与可释放的会话工厂。
 */
export function createMatcher(options: MatcherOptions = {}) {
  return {
    /**
     * 独立匹配一个帖子，并在完成或失败后释放计算资源。
     *
     * @param {TopicPost} post 待匹配帖子。
     * @param {KeywordRule[]} rules 按优先级排列的规则。
     * @return {Promise<KeywordMatch | undefined>} 首条命中结果。
     */
    async findMatch(
      post: TopicPost,
      rules: KeywordRule[],
    ): Promise<KeywordMatch | undefined> {
      const session = createSession();
      try {
        return await session.findMatch(post, rules);
      } finally {
        session.close();
      }
    },
    createSession,
  };

  /**
   * 创建独立轮询会话，同一会话按序匹配并复用一个正则 Worker。
   *
   * @return {object} 匹配与资源释放方法。
   */
  function createSession() {
    let worker: Worker | undefined;
    let workerUrl: string | undefined;
    let closed = false;
    let cancelActive: (() => void) | undefined;
    let tail = Promise.resolve();
    const preparedRules = new WeakMap<KeywordRule[], PreparedRule[]>();

    /** 销毁 Worker 及脚本 URL，允许后续匹配创建干净的执行环境。 */
    function terminateWorker(): void {
      worker?.terminate();
      worker = undefined;
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      workerUrl = undefined;
    }

    /**
     * 在可复用 Worker 中执行一条正则，超时或异常时销毁 Worker。
     *
     * @param {string} text 匹配文本。
     * @param {PreparedRule} rule 规范化规则。
     * @return {Promise<boolean>} 正则是否命中。
     */
    function matchesRegex(text: string, rule: PreparedRule): Promise<boolean> {
      if (closed) return Promise.resolve(false);
      if (!worker) {
        workerUrl = URL.createObjectURL(
          new Blob([regexWorkerSource], { type: "text/javascript" }),
        );
        try {
          worker = options.createWorker
            ? options.createWorker(workerUrl)
            : new Worker(workerUrl, { type: "module" });
        } catch (error) {
          terminateWorker();
          throw error;
        }
      }
      const current = worker;
      return new Promise((resolve) => {
        let settled = false;
        /**
         * 清除本次监听和定时器，必要时终止失效的 Worker。
         *
         * @param {boolean} matched 匹配结果。
         * @param {boolean} discard 是否销毁 Worker。
         */
        function finish(matched: boolean, discard = false): void {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          current.onmessage = null;
          current.onerror = null;
          cancelActive = undefined;
          if (discard) terminateWorker();
          resolve(matched);
        }
        const timeout = setTimeout(
          () => finish(false, true),
          regexMatchTimeoutMs,
        );
        cancelActive = () => finish(false, true);
        current.onmessage = (event) => finish(event.data?.matched === true);
        current.onerror = (event) => {
          event.preventDefault();
          finish(false, true);
        };
        try {
          current.postMessage({
            text,
            pattern: rule.keyword,
            flags: rule.caseSensitive ? "" : "i",
          });
        } catch {
          finish(false, true);
        }
      });
    }

    /**
     * 处理一个帖子，复用各匹配位置的原始文本与小写文本。
     *
     * @param {TopicPost} post 帖子内容。
     * @param {KeywordRule[]} rules 规则数组；同一会话内视为只读。
     * @return {Promise<KeywordMatch | undefined>} 按规则及位置顺序的首个命中。
     */
    async function matchPost(
      post: TopicPost,
      rules: KeywordRule[],
    ): Promise<KeywordMatch | undefined> {
      if (closed) return undefined;
      let prepared = preparedRules.get(rules);
      if (!prepared) {
        prepared = rules.map((rule) => ({
          keyword: rule.keyword.trim(),
          lowerKeyword: rule.keyword.trim().toLocaleLowerCase(),
          caseSensitive: Boolean(rule.caseSensitive),
          useRegex: Boolean(rule.useRegex),
          locations: [...rule.locations],
        }));
        preparedRules.set(rules, prepared);
      }
      const texts = new Map<MatchLocation, { raw: string; lower?: string }>();
      for (const rule of prepared) {
        if (!rule.keyword) continue;
        for (const location of rule.locations) {
          if (closed) return undefined;
          let text = texts.get(location);
          if (!text) {
            text = { raw: locationText(post, location) };
            texts.set(location, text);
          }
          const matched = rule.useRegex
            ? await matchesRegex(text.raw, rule)
            : rule.caseSensitive
            ? text.raw.includes(rule.keyword)
            : (text.lower ??= text.raw.toLocaleLowerCase()).includes(
              rule.lowerKeyword,
            );
          if (matched) return { keyword: rule.keyword, location };
        }
      }
      return undefined;
    }

    return {
      /**
       * 将帖子加入顺序队列，防止并发调用覆盖 Worker 回调。
       *
       * @param {TopicPost} post 待匹配帖子。
       * @param {KeywordRule[]} rules 当前轮询的只读规则。
       * @return {Promise<KeywordMatch | undefined>} 首条命中结果。
       */
      findMatch(
        post: TopicPost,
        rules: KeywordRule[],
      ): Promise<KeywordMatch | undefined> {
        const result = tail.then(() => matchPost(post, rules));
        tail = result.then(() => {}, () => {});
        return result;
      },
      /** 结束会话，取消正在等待的正则并释放 Worker。 */
      close(): void {
        closed = true;
        cancelActive?.();
        terminateWorker();
      },
    };
  }
}

/**
 * 获取指定匹配位置的文本，保留正文与摘要之间的换行。
 *
 * @param {TopicPost} post 帖子。
 * @param {MatchLocation} location 匹配位置。
 * @return {string} 指定位置的文本。
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
