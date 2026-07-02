import type { PollSort, TopicPost } from "../models.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";
import { createHeyboxSignatureParams } from "./heybox_signer.ts";

export type HeyboxTopicSourceConfig = {
  apiBaseUrl?: string;
  appVersion?: string;
  cookie?: string;
  deviceId?: string;
  deviceInfo?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
  random?: () => number;
  userAgent?: string;
};

const topicFeedsPath = "/bbs/app/topic/feeds";
const publishTimeFetchLimit = 100;

export function createHeyboxTopicSource(config: HeyboxTopicSourceConfig = {}): TopicSource {
  const apiBaseUrl = config.apiBaseUrl ?? "https://api.xiaoheihe.cn";
  const appVersion = config.appVersion ?? "2.5.6";
  const deviceInfo = config.deviceInfo ?? "Chrome";
  const deviceId = config.deviceId ?? crypto.randomUUID().replaceAll("-", "");
  const fetchFn = config.fetchFn ?? fetch;
  const userAgent = config.userAgent ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  return {
    async listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]> {
      const limit = normalizeLimit(options.limit);
      const signature = createHeyboxSignatureParams(
        topicFeedsPath,
        config.now?.() ?? new Date(),
        config.random,
      );
      const url = new URL(topicFeedsPath, apiBaseUrl);
      const params: Record<string, string> = {
        _time: String(signature.time),
        app: "heybox",
        client_type: "web",
        device_id: deviceId,
        device_info: deviceInfo,
        dw: "604",
        heybox_id: "",
        hkey: signature.hkey,
        lastval: "",
        limit: String(requestLimit(limit, options.sort)),
        nonce: signature.nonce,
        offset: "0",
        os_type: "web",
        topic_id: topicId,
        version: "999.0.4",
        web_version: appVersion.split(".").slice(0, 2).join("."),
        x_app: "heybox_website",
        x_client_type: "web",
        x_os_type: "Windows",
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
          referer: "https://www.xiaoheihe.cn/",
          "user-agent": userAgent,
          ...(config.cookie ? { cookie: config.cookie } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Heybox topic feed request failed with HTTP ${response.status}`);
      }

      const payload = await response.json();
      assertHeyboxOk(payload);
      assertRequestedSortApplied(payload, options.sort);
      const posts = parseHeyboxTopicPosts(payload, topicId);
      return options.sort === "publishTime"
        ? posts.toSorted(comparePostPublishedAtDesc).slice(0, limit)
        : posts;
    },
  };
}

export function parseHeyboxTopicPosts(payload: unknown, topicId: string): TopicPost[] {
  const links = arrayAt(payload, ["result", "links"]);

  return links.map((link) => {
    const record = asRecord(link);
    const shareUrl = stringField(record, ["share_url", "url", "link", "web_url"]);
    const webLinkId = linkIdFromUrl(shareUrl);
    const id = webLinkId ||
      stringField(record, ["linkid", "link_id", "post_id", "article_id", "id"]);

    return {
      body: stringField(record, ["content", "text", "body", "description"]),
      commentReplies: textList(record, ["reply_list", "replies", "comment_replies"]),
      comments: textList(record, ["comment_list", "comments", "hot_comments"]),
      excerpt: stringField(record, ["description", "summary", "brief", "excerpt"]),
      id,
      publishedAt: timeField(record, ["create_at", "created_at", "publish_time", "timestamp"]),
      title: stringField(record, ["title", "subject", "name"]),
      url: webLinkId ? `https://www.xiaoheihe.cn/app/bbs/link/${webLinkId}` : shareUrl ||
        `https://www.xiaoheihe.cn/app/topic/link/${topicId}`,
    };
  }).filter((post) => post.id && (post.title || post.excerpt || post.body));
}

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

function normalizeLimit(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 20;
}

function requestLimit(limit: number, sort: PollSort): number {
  return sort === "publishTime" ? Math.max(limit, publishTimeFetchLimit) : limit;
}

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

function comparePostPublishedAtDesc(left: TopicPost, right: TopicPost): number {
  const leftTime = new Date(left.publishedAt).getTime();
  const rightTime = new Date(right.publishedAt).getTime();

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return rightTime - leftTime;
  }

  return right.publishedAt.localeCompare(left.publishedAt);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayAt(value: unknown, path: string[]): unknown[] {
  let current = value;

  for (const key of path) {
    current = asRecord(current)[key];
  }

  return Array.isArray(current) ? current : [];
}

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

function linkIdFromUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const queryLinkId = url.searchParams.get("link_id");
    if (queryLinkId) {
      return queryLinkId;
    }

    const [, pathLinkId = ""] = url.pathname.match(/\/app\/bbs\/link\/([^/]+)/) ?? [];
    return pathLinkId;
  } catch {
    return "";
  }
}

function timeField(record: Record<string, unknown>, keys: string[]): string {
  const value = stringField(record, keys);
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue * 1000).toISOString();
  }

  return value || new Date(0).toISOString();
}

function textList(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = record[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(textFromUnknown).filter((text) => text.length > 0);
  });
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);
  return stringField(record, ["content", "text", "description", "body", "reply"]);
}
