/**
 * @file 本文件实现小黑盒话题帖子数据源。
 */
import type { PollSort, TopicPost } from "../models.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";
import {
  createHeyboxSignatureParams,
  type HeyboxSignatureMode,
} from "./heybox_signer.ts";
import { createHeyboxNativeSignatureParams } from "./heybox_native_signer.ts";
import { buildNativeRndV14 } from "./heybox_native_rnd.ts";

/**
 * 小黑盒话题数据源配置。
 */
export type HeyboxTopicSourceConfig = {
  appBuild?: string;
  apiBaseUrl?: string;
  appVersion?: string;
  channel?: string;
  cookie?: string;
  deviceId?: string;
  deviceInfo?: string;
  dw?: string;
  fetchFn?: typeof fetch;
  /** 独立匿名会话提供的详情传输；列表仍使用原有请求配置。 */
  fetchDetail?: (id: string) => Promise<Response>;
  heyboxId?: string;
  now?: () => Date;
  osVersion?: string;
  random?: () => number;
  signatureMode?: HeyboxSignatureMode;
  timeZone?: string;
  userAgent?: string;
};

/**
 * 小黑盒话题信息流接口路径。
 */
const topicFeedsPath = "/bbs/app/topic/feeds";
/**
 * 小黑盒帖子详情接口路径。
 */
const linkTreePath = "/bbs/app/link/tree";
/** 上游要求验证或限流后停止详情访问，避免逐帖重试继续增加负载。 */
const detailRestrictionCooldownMs = 15 * 60 * 1000;
/**
 * 小黑盒网页端可信来源。
 */
const trustedHeyboxWebOrigin = "https://www.xiaoheihe.cn";
/**
 * 允许提取帖子 ID 的小黑盒域名。
 */
const trustedHeyboxLinkIdHostnames = ["api.xiaoheihe.cn", "www.xiaoheihe.cn"];
/**
 * 允许作为帖子展示链接的网页路径前缀。
 */
const trustedHeyboxPostPathPrefixes = ["/app/bbs/link/", "/app/topic/link/"];

/**
 * 创建小黑盒话题帖子数据源。
 * 默认使用 build1149 协议；旧模式须显式指定，协议兼容不保证上游免验证码。
 *
 * @param config 小黑盒接口请求配置。
 * @return 话题帖子数据源实现。
 */
export function createHeyboxTopicSource(
  config: HeyboxTopicSourceConfig = {},
): TopicSource {
  const apiBaseUrl = config.apiBaseUrl ?? "https://api.xiaoheihe.cn";
  const signatureMode = config.signatureMode ?? "app-v1149";
  const native1149 = signatureMode === "app-v1149" ||
    signatureMode === "app-v1149-rnd14";
  const appBuild = config.appBuild ?? (native1149 ? "1149" : "783");
  const appVersion = config.appVersion ?? (native1149 ? "1.3.400" : "1.3.232");
  if (native1149 && (appBuild !== "1149" || appVersion !== "1.3.400")) {
    throw new Error("app-v1149 requires Heybox 1.3.400/build1149");
  }
  const channel = config.channel ?? "heybox_wandoujia";
  const deviceInfo = config.deviceInfo ?? "M2104K10AC";
  const deviceId = config.deviceId ?? crypto.randomUUID().replaceAll("-", "");
  const dw = config.dw ?? "393";
  const fetchFn = config.fetchFn ?? fetch;
  let detailBlockedUntil = 0;
  const heyboxId = native1149
    ? (config.heyboxId || "-1")
    : (config.heyboxId ?? "");
  const osVersion = config.osVersion ?? "14";
  const timeZone = config.timeZone ?? "Asia/Shanghai";
  const userAgent = config.userAgent ??
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 " +
      "Safari/537.36 ApiMaxJia/1.0";

  return {
    /**
     * 返回整个详情来源的冷却时间，供独立出口向调用方传递退避状态。
     * @return {number} 剩余秒数。
     */
    detailRetryAfter(): number {
      return Math.max(
        0,
        Math.ceil(
          (detailBlockedUntil - (config.now?.() ?? new Date()).getTime()) /
            1000,
        ),
      );
    },
    /**
     * 获取帖子详情并与列表帖子合并。
     *
     * @param post 列表接口返回的帖子。
     * @return 补全详情后的帖子。
     */
    async getPostDetails(post: TopicPost): Promise<TopicPost> {
      return await hydrateTopicPost(post);
    },

    /**
     * 在十秒请求期限内拉取指定话题的最新帖子列表。
     *
     * @param {string} topicId 小黑盒话题 ID。
     * @param {TopicListOptions} options 列表拉取选项。
     * @return {Promise<TopicPost[]>} 解析后的帖子列表。
     */
    async listLatestPosts(
      topicId: string,
      options: TopicListOptions,
    ): Promise<TopicPost[]> {
      const limit = normalizeLimit(options.limit);
      const requestLimit = options.sort === "publishTime"
        ? Math.max(limit, 30)
        : limit;
      const url = new URL(topicFeedsPath, apiBaseUrl);
      const params: Record<string, string> = {
        ...await signedRequestParams(topicFeedsPath),
        limit: String(requestLimit),
        offset: "0",
        topic_id: topicId,
      };

      const sortFilter = heyboxSortFilter(options.sort);
      if (sortFilter) {
        params.sort_filter = sortFilter;
      }

      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          accept: "application/json,text/plain,*/*",
          referer: "http://api.maxjia.com/",
          "user-agent": userAgent,
          ...(config.cookie ? { cookie: config.cookie } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(
          `Heybox topic feed request failed with HTTP ${response.status}`,
        );
      }

      const payload = await response.json();
      assertHeyboxOk(payload);
      assertRequestedSortApplied(payload, options.sort);
      const posts = parseHeyboxTopicPosts(payload, topicId);
      return orderPosts(posts, options.sort).slice(0, limit);
    },
  };

  /**
   * 构建带签名的小黑盒请求参数。
   *
   * @param path 请求路径。
   * @return 请求查询参数；实验模式额外使用同一时间和身份生成版本 14 的 _rnd。
   */
  async function signedRequestParams(
    path: string,
  ): Promise<Record<string, string>> {
    const signature = native1149
      ? await createHeyboxNativeSignatureParams(
        path,
        deviceId,
        heyboxId,
        config.now?.() ?? new Date(),
        config.random,
      )
      : createHeyboxSignatureParams(
        path,
        config.now?.() ?? new Date(),
        config.random,
        signatureMode,
      );

    return {
      ...(signatureMode === "app-v1149-rnd14"
        ? {
          _rnd: buildNativeRndV14(
            path,
            signature.time,
            deviceId,
            heyboxId,
            osVersion,
            appVersion,
          ),
        }
        : {}),
      _time: String(signature.time),
      build: appBuild,
      channel,
      device_info: deviceInfo,
      dw,
      heybox_id: heyboxId,
      hkey: signature.hkey,
      imei: deviceId,
      nonce: signature.nonce,
      os_type: "Android",
      os_version: osVersion,
      time_zone: timeZone,
      version: appVersion,
      x_app: "heybox",
      x_client_type: "mobile",
      x_os_type: "Android",
    };
  }

  /**
   * 尝试通过详情接口补全帖子内容，并标记正文是否完整。
   *
   * @param {TopicPost} post 待补全帖子。
   * @return {Promise<TopicPost>} 补全后的帖子；失败时保留列表内容并标记详情不可用。
   */
  async function hydrateTopicPost(post: TopicPost): Promise<TopicPost> {
    post = { ...post };
    delete post.detailUnavailable;
    delete post.detailDeferredUntil;
    if (!post.id) {
      return { ...post, detailsComplete: false };
    }

    try {
      const detailPost = await fetchLinkDetailPost(post);
      if (detailPost?.detailUnavailable === "deleted") return detailPost;
      return detailPost
        ? { ...mergeTopicPosts(post, detailPost), detailsComplete: true }
        : { ...post, detailsComplete: false };
    } catch {
      pauseRestrictedDetails("request_failed", 60000);
      return { ...post, detailsComplete: false };
    }
  }

  /**
   * 读取正文和首屏评论；明确删除的帖子单独标记，来源受限制时共享冷却。
   * 默认 HTTP 请求限时十秒，注入的匿名传输自行限制初始化与请求时限。
   * 原生接口省略分页参数会返回空评论列表，显式读取第一页的二十个评论组。
   *
   * @param {TopicPost} post 列表接口返回的帖子。
   * @return {Promise<TopicPost | undefined>} 详情帖子，接口无可用内容时返回 undefined。
   */
  async function fetchLinkDetailPost(
    post: TopicPost,
  ): Promise<TopicPost | undefined> {
    if ((config.now?.() ?? new Date()).getTime() < detailBlockedUntil) {
      return undefined;
    }
    const url = new URL(linkTreePath, apiBaseUrl);
    const params: Record<string, string> = {
      ...await signedRequestParams(linkTreePath),
      link_id: post.id,
      page: "1",
      limit: "20",
    };

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = config.fetchDetail
      ? await config.fetchDetail(post.id)
      : await fetchFn(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          accept: "application/json,text/plain,*/*",
          referer: "http://api.maxjia.com/",
          "user-agent": userAgent,
          ...(config.cookie ? { cookie: config.cookie } : {}),
        },
      });

    if (response.status === 429) {
      await response.body?.cancel();
      pauseRestrictedDetails("http_429");
      return undefined;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status !== 404 && response.status !== 410) {
        pauseRestrictedDetails(`http_${response.status}`, 60000);
      }
      return undefined;
    }

    const payload = await response.json();
    if (
      asRecord(payload).status === "failed" &&
      typeof asRecord(payload).msg === "string" &&
      String(asRecord(payload).msg).includes("频繁")
    ) {
      pauseRestrictedDetails("business_rate_limit");
      return undefined;
    }
    if (
      ["show_captcha", "lack_token", "hkey"].includes(
        String(asRecord(payload).status),
      )
    ) {
      const reason = String(asRecord(payload).status);
      pauseRestrictedDetails(
        reason,
        reason === "show_captcha" ? detailRestrictionCooldownMs : 60000,
      );
      return undefined;
    }
    if (
      asRecord(payload).status === "failed" &&
      asRecord(payload).msg === "该内容已被删除"
    ) {
      return { ...post, detailsComplete: false, detailUnavailable: "deleted" };
    }
    assertHeyboxOk(payload);
    const result = asRecord(asRecord(payload).result);
    const link = asRecord(result.link);
    const record = normalizeHeyboxDetailRecord(link);

    if (Object.keys(record).length === 0) return undefined;
    const detail = postFromHeyboxRecord(record, topicIdFromPost(post));
    // 数字编号与分享链接短 ID 可以属于同一帖；数字请求还须核对响应原始编号。
    // 短 ID 请求仍以解析出的可信分享标识校验，不能用冲突的原始短 ID 放行。
    const nativeId = stringField(record, [
      "linkid",
      "link_id",
      "post_id",
      "article_id",
      "id",
    ]);
    const matchesIdentity = /^\d+$/.test(post.id)
      ? nativeId === post.id
      : detail.id === post.id;
    if (!matchesIdentity) {
      throw new Error("Mismatched detail post");
    }
    const body = detailBodyFromHeyboxRecord(record);
    if (body === undefined) return undefined;
    const grouped = heyboxDetailCommentGroups(
      result.comments ?? asRecord(link.comment).comments,
    );
    return {
      ...detail,
      body,
      comments: [...detail.comments, ...grouped.comments],
      commentReplies: [...detail.commentReplies, ...grouped.commentReplies],
    };
  }

  /**
   * 暂停受限制的详情接口，并记录不含请求身份或帖子内容的诊断信息。
   * @param {string} reason 上游返回的固定限制类型。
   * @param {number} durationMs 冷却毫秒数，验证码和限流默认十五分钟。
   */
  function pauseRestrictedDetails(
    reason: string,
    durationMs = detailRestrictionCooldownMs,
  ): void {
    // 较晚完成的并发请求不能缩短先前验证码/限流响应要求的冷却。
    detailBlockedUntil = Math.max(
      detailBlockedUntil,
      (config.now?.() ?? new Date()).getTime() + durationMs,
    );
    console.warn(JSON.stringify({
      event: "heybox_detail_restricted",
      reason,
      retryAt: new Date(detailBlockedUntil).toISOString(),
    }));
  }
}

/**
 * 按指定排序方式整理帖子列表。
 *
 * @param posts 待排序帖子列表。
 * @param sort 目标排序方式。
 * @return 排序后的帖子列表。
 */
function orderPosts(posts: TopicPost[], sort: PollSort): TopicPost[] {
  if (sort !== "publishTime") {
    return posts;
  }

  return [...posts].sort((left, right) =>
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
  );
}

/**
 * 从小黑盒接口响应中解析话题帖子列表。
 *
 * @param payload 小黑盒接口响应。
 * @param topicId 当前话题 ID。
 * @return 解析得到的有效帖子列表。
 */
export function parseHeyboxTopicPosts(
  payload: unknown,
  topicId: string,
): TopicPost[] {
  const links = arrayAt(payload, ["result", "links"]);

  return links.map((link) => {
    const record = asRecord(link);
    return postFromHeyboxRecord(record, topicId);
  }).filter((post) => post.id && (post.title || post.excerpt || post.body));
}

/**
 * 将小黑盒帖子记录转换为应用内帖子结构。
 *
 * @param record 小黑盒帖子原始记录。
 * @param topicId 当前话题 ID。
 * @return 应用内帖子结构。
 */
function postFromHeyboxRecord(
  record: Record<string, unknown>,
  topicId: string,
): TopicPost {
  const shareUrl = stringField(record, ["share_url", "url", "link", "web_url"]);
  const webLinkId = linkIdFromUrl(shareUrl);
  const id = webLinkId ||
    stringField(record, ["linkid", "link_id", "post_id", "article_id", "id"]);
  const url = safeHeyboxPostUrl(webLinkId, shareUrl, topicId);

  return {
    body: contentField(record, ["text", "content", "body", "description"]),
    commentReplies: textList(record, [
      "reply_list",
      "replies",
      "comment_replies",
    ]),
    comments: textList(record, ["comment_list", "comments", "hot_comments"]),
    excerpt: contentField(record, [
      "description",
      "summary",
      "brief",
      "excerpt",
    ]),
    id,
    publishedAt: timeField(record, [
      "create_at",
      "created_at",
      "publish_time",
      "timestamp",
    ]),
    title: stringField(record, ["title", "subject", "name"]),
    url,
  };
}

/**
 * 兼容原生详情的 body/stats 包装；合并前检查各层编号，禁止以内层覆盖冲突身份。
 * 普通帖子记录和仅包含富文本 body 的记录保持原结构。
 * @param {Record<string, unknown>} link 详情接口的 link 对象。
 * @return {Record<string, unknown>} 用于字段读取和身份校验的帖子记录。
 */
function normalizeHeyboxDetailRecord(
  link: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !("stats" in link || "comment" in link) ||
    !link.body || typeof link.body !== "object" || Array.isArray(link.body)
  ) return link;
  const body = asRecord(link.body);
  const stats = asRecord(link.stats);
  const identities = [link, stats, body].map((record) =>
    stringField(record, ["linkid", "link_id", "post_id", "article_id", "id"])
  ).filter(Boolean);
  if (new Set(identities).size > 1) {
    throw new Error("Conflicting nested detail identity");
  }
  return { ...stats, ...body };
}

/**
 * 解析详情接口的评论分组；每组首条是主评论，其余条目作为回复。
 * 只读取当前响应已包含的评论，不将第一页或部分回复视为全部评论。
 * @param {unknown} value 顶层 comments 或原生 comment.comments。
 * @return {{comments: string[]; commentReplies: string[]}} 已返回的主评论及回复文本。
 */
function heyboxDetailCommentGroups(
  value: unknown,
): { comments: string[]; commentReplies: string[] } {
  const comments: string[] = [], commentReplies: string[] = [];
  if (!Array.isArray(value)) return { comments, commentReplies };
  for (const group of value) {
    const entries = asRecord(group).comment;
    if (!Array.isArray(entries)) {
      const text = textFromUnknown(group);
      if (text) comments.push(text);
      continue;
    }
    entries.forEach((entry, index) => {
      const text = textFromUnknown(entry);
      if (text) (index === 0 ? comments : commentReplies).push(text);
    });
  }
  return { comments, commentReplies };
}

/**
 * 生成安全可信的小黑盒帖子展示链接。
 *
 * @param {string} linkId 从分享链接中提取到的小黑盒帖子 ID。
 * @param {string} shareUrl 小黑盒接口返回的分享链接。
 * @param {string} topicId 当前话题 ID。
 * @return {string} 可安全放入页面 href 的帖子链接。
 */
function safeHeyboxPostUrl(
  linkId: string,
  shareUrl: string,
  topicId: string,
): string {
  if (linkId.trim()) {
    return heyboxPostUrlFromLinkId(linkId);
  }

  return trustedHeyboxShareUrl(shareUrl) ?? heyboxTopicFallbackUrl(topicId);
}

/**
 * 根据帖子 ID 构建官方网页帖子链接。
 *
 * @param {string} linkId 小黑盒帖子 ID。
 * @return {string} 官方网页帖子链接。
 */
function heyboxPostUrlFromLinkId(linkId: string): string {
  return `${trustedHeyboxWebOrigin}/app/bbs/link/${
    encodeURIComponent(linkId.trim())
  }`;
}

/**
 * 根据话题 ID 构建官方网页回退链接。
 *
 * @param {string} topicId 小黑盒话题 ID。
 * @return {string} 官方网页话题链接。
 */
function heyboxTopicFallbackUrl(topicId: string): string {
  return `${trustedHeyboxWebOrigin}/app/topic/link/${
    encodeURIComponent(topicId.trim())
  }`;
}

/**
 * 校验接口返回的分享链接是否为可信小黑盒网页链接。
 *
 * @param {string} value 待校验的分享链接。
 * @return {string | undefined} 可信分享链接；不可信时返回 undefined。
 */
function trustedHeyboxShareUrl(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.origin !== trustedHeyboxWebOrigin) {
      return undefined;
    }

    if (
      !trustedHeyboxPostPathPrefixes.some((prefix) =>
        url.pathname.startsWith(prefix)
      )
    ) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * 合并列表帖子和详情帖子。
 *
 * @param listPost 列表接口返回的帖子。
 * @param detailPost 详情接口返回的帖子。
 * @return 合并后的帖子。
 */
function mergeTopicPosts(
  listPost: TopicPost,
  detailPost: TopicPost,
): TopicPost {
  return {
    body: detailPost.body,
    commentReplies: detailPost.commentReplies.length > 0
      ? detailPost.commentReplies
      : listPost.commentReplies,
    comments: detailPost.comments.length > 0
      ? detailPost.comments
      : listPost.comments,
    excerpt: detailPost.excerpt || listPost.excerpt,
    id: listPost.id || detailPost.id,
    publishedAt: detailPost.publishedAt || listPost.publishedAt,
    title: detailPost.title || listPost.title,
    url: listPost.url || detailPost.url,
  };
}

/**
 * 从帖子 URL 中提取话题 ID。
 *
 * @param post 待提取话题 ID 的帖子。
 * @return 话题 ID，无法提取时返回空字符串。
 */
function topicIdFromPost(post: TopicPost): string {
  const [, topicId = ""] = post.url.match(/\/app\/topic\/link\/([^/?#]+)/) ??
    [];
  return topicId;
}

/**
 * 校验小黑盒接口响应是否成功。
 *
 * @param payload 小黑盒接口响应。
 * @return 校验通过时无返回值。
 * @throws 接口状态非 ok 时抛出错误。
 */
function assertHeyboxOk(payload: unknown): void {
  const record = asRecord(payload);
  if (record.status === "ok") {
    return;
  }

  const message = typeof record.msg === "string" && record.msg.trim()
    ? record.msg.trim()
    : "unknown error";
  throw new Error(`Heybox topic feed request failed: ${message}`);
}

/**
 * 规范化帖子拉取数量。
 *
 * @param value 外部传入的数量。
 * @return 合法的帖子拉取数量。
 */
function normalizeLimit(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 20;
}

/**
 * 将应用排序方式转换为小黑盒接口排序参数。
 *
 * @param sort 应用内排序方式。
 * @return 小黑盒接口 sort_filter 参数值。
 */
export function heyboxSortFilter(sort: PollSort): string {
  switch (sort) {
    case "smart":
      return "hot-rank";
    case "replyTime":
      return "reply";
    case "publishTime":
      return "create";
  }
}

/**
 * 校验小黑盒响应中是否支持并应用了请求的排序方式。
 *
 * @param payload 小黑盒接口响应。
 * @param sort 请求的排序方式。
 * @return 校验通过时无返回值。
 * @throws 响应排序选项不包含请求排序时抛出错误。
 */
function assertRequestedSortApplied(payload: unknown, sort: PollSort): void {
  const expectedSortFilter = heyboxSortFilter(sort);
  const sortFilters = arrayAt(payload, ["result", "sort_filter"]);
  if (sortFilters.length === 0) {
    return;
  }

  const availableKeys = sortFilters
    .map((filter) => stringField(asRecord(filter), ["key", "value"]))
    .filter((key) => key.length > 0);

  if (availableKeys.length > 0 && !availableKeys.includes(expectedSortFilter)) {
    throw new Error(
      `Heybox topic feed did not apply requested sort_filter=${expectedSortFilter}`,
    );
  }
}

/**
 * 将未知值安全转换为记录对象。
 *
 * @param value 待转换值。
 * @return 记录对象，无法转换时返回空对象。
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

/**
 * 按路径从未知结构中读取数组。
 *
 * @param value 根对象。
 * @param path 属性路径。
 * @return 路径对应的数组，不存在或不是数组时返回空数组。
 */
function arrayAt(value: unknown, path: string[]): unknown[] {
  let current = value;

  for (const key of path) {
    current = asRecord(current)[key];
  }

  return Array.isArray(current) ? current : [];
}

/**
 * 从记录对象的候选字段中读取字符串值。
 *
 * @param record 待读取的记录对象。
 * @param keys 候选字段名列表。
 * @return 第一个可用的字符串值。
 */
function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

/**
 * 小黑盒富文本中不应作为正文展示的媒体节点类型。
 */
const heyboxMediaNodeTypes = new Set([
  "audio",
  "img",
  "image",
  "video",
]);

/** 已核对的原生卡片正文结构；顺序与卡片可见文字一致，不读取跳转或统计协议。 */
const heyboxCardNodeFields = new Map<string, readonly string[]>([
  ["simple_card", ["title", "desc"]],
  ["post_guide_card", ["text", "description"]],
]);

/**
 * 读取详情正文；缺失或包含未知结构时不以摘要证明完整，显式空正文仍可区分。
 * description 是摘要，不作为正文完整性的依据。
 * @param {Record<string, unknown>} record 详情接口的帖子记录。
 * @return {string | undefined} 已支持结构的正文；无法确认时返回 undefined。
 */
function detailBodyFromHeyboxRecord(
  record: Record<string, unknown>,
): string | undefined {
  let empty: string | undefined;
  for (const key of ["text", "content", "body"]) {
    if (!(key in record) || record[key] == null) continue;
    if (!isSupportedHeyboxContent(record[key])) return undefined;
    const text = plainTextFromHeyboxContent(record[key]);
    if (text) return text;
    empty = "";
  }
  return empty;
}

/**
 * 核对纯文本解析器选用字段中的节点结构，避免数组中的未知段落被静默丢弃。
 * 已知媒体节点沿用文本解析器的忽略规则，本校验不表示图片或视频已被读取。
 * @param {unknown} value 纯文本、富文本节点或序列化容器。
 * @return {boolean} 当前解析器是否支持选用字段中的全部节点。
 */
function isSupportedHeyboxContent(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const text = value.trim();
    if (!looksLikeJsonContainer(text)) return true;
    try {
      return isSupportedHeyboxContent(JSON.parse(text));
    } catch {
      return true;
    }
  }
  if (Array.isArray(value)) return value.every(isSupportedHeyboxContent);
  const record = asRecord(value);
  const nodeType = typeof record.type === "string"
    ? record.type.trim().toLowerCase()
    : "";
  if (heyboxMediaNodeTypes.has(nodeType)) return true;
  const cardFields = heyboxCardNodeFields.get(nodeType);
  if (cardFields) {
    return heyboxCardText(record[nodeType], cardFields) !== undefined;
  }
  let found = false;
  for (
    const key of ["text", "content", "description", "body", "children", "items"]
  ) {
    if (!(key in record) || record[key] == null) continue;
    if (!isSupportedHeyboxContent(record[key])) return false;
    found = true;
    if (plainTextFromHeyboxContent(record[key])) return true;
  }
  return found;
}

/**
 * 读取已核对的原生卡片文字，忽略图标和用于跳转或曝光统计的协议字段。
 * 缺少可识别字段或字段类型异常时返回 undefined，避免误报整篇正文完整。
 * @param {unknown} value 节点内的卡片对象。
 * @param {readonly string[]} keys 对应卡片类型的可见文字字段。
 * @return {string | undefined} 卡片的全部可展示文字，或无法识别的标记。
 */
function heyboxCardText(
  value: unknown,
  keys: readonly string[],
): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const card = asRecord(value);
  const fields = keys.map((key) => card[key]).filter((field) => field != null);
  if (
    fields.length === 0 || fields.some((field) => typeof field !== "string")
  ) {
    return undefined;
  }
  return (fields as string[]).map((field) => field.trim()).filter(Boolean).join(
    "\n",
  );
}

/**
 * 从记录对象的候选字段中读取正文并转换为纯文本。
 *
 * @param {Record<string, unknown>} record 待读取的记录对象。
 * @param {string[]} keys 候选字段名列表。
 * @return {string} 第一个可用字段的纯文本内容。
 */
function contentField(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }
    const text = plainTextFromHeyboxContent(record[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

/**
 * 将小黑盒正文的纯文本、富文本数组或 JSON 字符串统一转换为可展示文本。
 *
 * @param {unknown} value 小黑盒正文值。
 * @return {string} 去除媒体元数据后的纯文本。
 */
export function plainTextFromHeyboxContent(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || !looksLikeJsonContainer(text)) {
      return text;
    }
    try {
      return plainTextFromHeyboxContent(JSON.parse(text));
    } catch {
      return text;
    }
  }
  if (Array.isArray(value)) {
    return value.map(plainTextFromHeyboxContent).filter(Boolean).join("\n")
      .trim();
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return "";
  }
  const nodeType = typeof record.type === "string"
    ? record.type.trim().toLowerCase()
    : "";
  if (heyboxMediaNodeTypes.has(nodeType)) {
    return "";
  }
  const cardFields = heyboxCardNodeFields.get(nodeType);
  if (cardFields) {
    return heyboxCardText(record[nodeType], cardFields) ?? "";
  }
  return contentField(record, [
    "text",
    "content",
    "description",
    "body",
    "children",
    "items",
  ]);
}

/**
 * 判断字符串是否可能是 JSON 对象或数组。
 *
 * @param {string} value 待判断字符串。
 * @return {boolean} 可能是 JSON 容器时返回 true。
 */
function looksLikeJsonContainer(value: string): boolean {
  return (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("{") && value.endsWith("}"));
}

/**
 * 从链接中提取小黑盒帖子 ID。
 *
 * @param value 待解析链接。
 * @return 提取到的帖子 ID，无法提取时返回空字符串。
 */
function linkIdFromUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !trustedHeyboxLinkIdHostnames.includes(url.hostname)
    ) {
      return "";
    }

    const queryLinkId = url.searchParams.get("link_id");
    if (queryLinkId) {
      return queryLinkId;
    }

    const [, pathLinkId = ""] =
      url.pathname.match(/\/app\/bbs\/link\/([^/]+)/) ?? [];
    return pathLinkId;
  } catch {
    return "";
  }
}

/**
 * 从记录对象中读取并规范化时间字段。
 *
 * @param record 待读取的记录对象。
 * @param keys 候选时间字段名列表。
 * @return ISO 时间字符串或原始字符串时间。
 */
function timeField(record: Record<string, unknown>, keys: string[]): string {
  const value = stringField(record, keys);
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue * 1000).toISOString();
  }

  return value || new Date(0).toISOString();
}

/**
 * 从记录对象的候选数组字段中提取文本列表。
 *
 * @param record 待读取的记录对象。
 * @param keys 候选数组字段名列表。
 * @return 提取出的非空文本列表。
 */
function textList(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = record[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(textFromUnknown).filter((text) => text.length > 0);
  });
}

/**
 * 从未知值中提取文本内容。
 *
 * @param value 待提取文本的值。
 * @return 提取出的文本，无法提取时返回空字符串。
 */
function textFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return plainTextFromHeyboxContent(value);
  }

  const record = asRecord(value);
  return contentField(record, [
    "content",
    "text",
    "description",
    "body",
    "reply",
  ]);
}
