/** @file 按 Oracle 优先、Deno 备用调度详情请求，共享额度并分别冷却故障出口。 */
import type { TopicPost } from "../models.ts";
import type { TopicSource } from "./topic_source.ts";
import { cachedDetails } from "./heybox_detail_relay.ts";

/** 两个出口合计的滚动限频窗口。 */
const requestWindowMs = 60000;
/** 单个出口失败后的最长重试间隔。 */
const maxCooldownMs = 15 * 60000;

/** 详情出口的独立故障状态，所有账号共享同一实例。 */
type DetailRoute = {
  name: "oracle" | "deno";
  source: TopicSource;
  retryAt: number;
  failures: number;
};

/**
 * 创建优先直连、受限后使用备用出口的详情调度器；列表仍由主服务读取。
 * @param {TopicSource} primary Oracle 直连来源。
 * @param {TopicSource} backup Deno 鉴权出口。
 * @param {{requestsPerMinute?: number; now?: () => number}} options 两路合计预算与时钟。
 * @return {TopicSource} 缓存、去重、限频及恢复探测共用的数据源。
 */
export function withDetailFailover(
  primary: TopicSource,
  backup: TopicSource,
  options: { requestsPerMinute?: number; now?: () => number } = {},
): TopicSource {
  const limit = options.requestsPerMinute ?? 3;
  if (!Number.isInteger(limit) || limit < 1 || limit > 60) {
    throw new Error("Invalid detail request budget");
  }
  if (!primary.getPostDetails || !backup.getPostDetails) {
    throw new Error("Both detail routes must support post details");
  }
  const now = options.now ?? Date.now;
  const routes: DetailRoute[] = [
    { name: "oracle", source: primary, retryAt: 0, failures: 0 },
    { name: "deno", source: backup, retryAt: 0, failures: 0 },
  ];
  const requestTimes: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  /**
   * 计算出口自身和调度器故障退避共同要求的最早重试时间。
   * @param {DetailRoute} route 目标出口。
   * @return {number} 最早重试时间戳。
   */
  function availableAt(route: DetailRoute): number {
    const seconds = route.source.detailRetryAfter?.() ?? 0;
    return Math.max(
      route.retryAt,
      now() + (Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0),
    );
  }

  /**
   * 顺序尝试当前可用出口，冷却期结束后的真实请求同时承担恢复探测。
   * @param {string} id 帖子编号。
   * @return {Promise<TopicPost>} 完整详情、明确删除、预算排队或仍需重试的状态。
   */
  async function readUncached(id: string): Promise<TopicPost> {
    const post: TopicPost = {
      id,
      title: "",
      body: "",
      excerpt: "",
      comments: [],
      commentReplies: [],
      publishedAt: "",
      url: `https://www.xiaoheihe.cn/app/bbs/link/${id}`,
      detailsComplete: false,
    };
    for (const route of routes) {
      if (availableAt(route) > now()) continue;
      const started = now();
      while (
        requestTimes.length && requestTimes[0] <= started - requestWindowMs
      ) {
        requestTimes.shift();
      }
      if (requestTimes.length >= limit) {
        return {
          ...post,
          detailDeferredUntil: requestTimes[0] + requestWindowMs,
        };
      }
      requestTimes.push(started);
      try {
        const result = await route.source.getPostDetails!({ ...post });
        if (result.id !== id) throw new Error("Mismatched detail post");
        if (
          result.detailsComplete === true ||
          result.detailUnavailable === "deleted"
        ) {
          route.failures = 0;
          route.retryAt = 0;
          console.info(JSON.stringify({
            event: "heybox_detail_attempt",
            route: route.name,
            outcome: result.detailUnavailable === "deleted"
              ? "deleted"
              : "success",
            elapsedMs: now() - started,
          }));
          return result;
        }
        // 预算排队不是上游故障，保留等待时间，不触发备用请求或出口退避。
        if (
          Number.isFinite(result.detailDeferredUntil) &&
          result.detailDeferredUntil! > now()
        ) return result;
        // 支持故障状态的来源明确报告未冷却时，只是本帖缺失。
        // 保持下一帖可用；不提供故障状态的旧来源仍使用保守退避。
        if (route.source.detailRetryAfter?.() === 0) {
          console.info(JSON.stringify({
            event: "heybox_detail_attempt",
            route: route.name,
            outcome: "post_unavailable",
            elapsedMs: now() - started,
          }));
          continue;
        }
      } catch {
        // 网络失败与无可用详情都按单个出口退避，另一出口仍可继续尝试。
      }
      route.failures = Math.min(route.failures + 1, 5);
      route.retryAt = Math.max(
        availableAt(route),
        now() +
          Math.min(maxCooldownMs, requestWindowMs * 2 ** (route.failures - 1)),
      );
      console.warn(JSON.stringify({
        event: "heybox_detail_attempt",
        route: route.name,
        outcome: "unavailable",
        elapsedMs: now() - started,
        retryAt: new Date(route.retryAt).toISOString(),
      }));
    }
    return post;
  }

  /**
   * 串行执行不同帖子，保证冷却恢复时只有一个探测请求；相同帖子复用在途结果。
   * @param {string} id 帖子编号。
   * @return {Promise<TopicPost>} 缓存或真实详情。
   */
  const read = cachedDetails((id: string): Promise<TopicPost> => {
    const request = queue.then(() => readUncached(id));
    queue = request.then(() => {}, () => {});
    return request;
  }, now);

  return {
    /**
     * 保持列表来源与调度不变。
     * @param {string} id 话题编号。
     * @param {import("./topic_source.ts").TopicListOptions} listOptions 列表选项。
     * @return {Promise<TopicPost[]>} 列表帖子。
     */
    listLatestPosts: (id, listOptions) =>
      primary.listLatestPosts(id, listOptions),
    /**
     * 仅在两个出口都冷却时报告来源不可用的剩余时间。
     * @return {number} 最早可重试出口的剩余秒数。
     */
    detailRetryAfter: () =>
      Math.max(
        0,
        Math.ceil((Math.min(...routes.map(availableAt)) - now()) / 1000),
      ),
    /**
     * 合并完整详情与原始列表内容，失败保留摘要，排队不冒充上游故障。
     * @param {TopicPost} post 原始列表帖子。
     * @return {Promise<TopicPost>} 实际详情或明确的等待状态。
     */
    async getPostDetails(post: TopicPost): Promise<TopicPost> {
      const original = { ...post };
      delete original.detailDeferredUntil;
      delete original.detailUnavailable;
      try {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(post.id)) {
          throw new Error("Invalid post id");
        }
        const detail = await read(post.id);
        if (detail.detailsComplete === true) {
          return {
            ...original,
            ...detail,
            url: post.url,
            title: detail.title || post.title,
          };
        }
        return {
          ...original,
          detailsComplete: false,
          ...(detail.detailUnavailable
            ? { detailUnavailable: detail.detailUnavailable }
            : {}),
          ...(detail.detailDeferredUntil
            ? { detailDeferredUntil: detail.detailDeferredUntil }
            : {}),
        };
      } catch {
        return { ...original, detailsComplete: false };
      }
    },
  };
}
