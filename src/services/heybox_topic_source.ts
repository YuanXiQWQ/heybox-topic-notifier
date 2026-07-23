/**
 * @file 本文件实现小黑盒话题帖子数据源。
 */
import type { PollSort, TopicPost } from "../models.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";
import {
  createHeyboxSignatureParams,
  type HeyboxSignatureMode,
} from "./heybox_signer.ts";

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
 *
 * @param config 小黑盒接口请求配置。
 * @return 话题帖子数据源实现。
 */
export function createHeyboxTopicSource(
  config: HeyboxTopicSourceConfig = {},
): TopicSource {
  const apiBaseUrl = config.apiBaseUrl ?? "https://api.xiaoheihe.cn";
  const appBuild = config.appBuild ?? "783";
  const appVersion = config.appVersion ?? "1.3.232";
  const channel = config.channel ?? "heybox_wandoujia";
  const deviceInfo = config.deviceInfo ?? "M2104K10AC";
  const deviceId = config.deviceId ?? crypto.randomUUID().replaceAll("-", "");
  const dw = config.dw ?? "393";
  const fetchFn = config.fetchFn ?? fetch;
  const heyboxId = config.heyboxId ?? "";
  const osVersion = config.osVersion ?? "14";
  const signatureMode = config.signatureMode ?? "app";
  const timeZone = config.timeZone ?? "Asia/Shanghai";
  const userAgent = config.userAgent ??
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 " +
      "Safari/537.36 ApiMaxJia/1.0";

  return {
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
     * 拉取指定话题的最新帖子列表。
     *
     * @param topicId 小黑盒话题 ID。
     * @param options 列表拉取选项。
     * @return 解析后的帖子列表。
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
        ...signedRequestParams(topicFeedsPath),
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
   * @return 请求查询参数。
   */
  function signedRequestParams(path: string): Record<string, string> {
    const signature = createHeyboxSignatureParams(
      path,
      config.now?.() ?? new Date(),
      config.random,
      signatureMode,
    );

    return {
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
   * 尝试通过详情接口补全帖子内容。
   *
   * @param post 待补全帖子。
   * @return 补全后的帖子；补全失败时返回原帖子。
   */
  async function hydrateTopicPost(post: TopicPost): Promise<TopicPost> {
    if (!post.id) {
      return post;
    }

    try {
      const detailPost = await fetchLinkDetailPost(post);
      return detailPost ? mergeTopicPosts(post, detailPost) : post;
    } catch {
      return post;
    }
  }

  /**
   * 请求帖子详情接口并解析详情帖子。
   *
   * @param post 列表接口返回的帖子。
   * @return 详情帖子，接口无可用内容时返回 undefined。
   */
  async function fetchLinkDetailPost(
    post: TopicPost,
  ): Promise<TopicPost | undefined> {
    const url = new URL(linkTreePath, apiBaseUrl);
    const params: Record<string, string> = {
      ...signedRequestParams(linkTreePath),
      link_id: post.id,
    };

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetchFn(url, {
      headers: {
        accept: "application/json,text/plain,*/*",
        referer: "http://api.maxjia.com/",
        "user-agent": userAgent,
        ...(config.cookie ? { cookie: config.cookie } : {}),
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json();
    assertHeyboxOk(payload);
    const link = asRecord(asRecord(payload).result).link;
    const record = asRecord(link);

    return Object.keys(record).length > 0
      ? postFromHeyboxRecord(record, topicIdFromPost(post))
      : undefined;
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
    body: stringField(record, ["text", "content", "body", "description"]),
    commentReplies: textList(record, [
      "reply_list",
      "replies",
      "comment_replies",
    ]),
    comments: textList(record, ["comment_list", "comments", "hot_comments"]),
    excerpt: stringField(record, [
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
    body: detailPost.body || listPost.body,
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
    return value.trim();
  }

  const record = asRecord(value);
  return stringField(record, [
    "content",
    "text",
    "description",
    "body",
    "reply",
  ]);
}
