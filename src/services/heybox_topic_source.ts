import type { PollSort, TopicPost } from "../models.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";
import { createHeyboxSignatureParams } from "./heybox_signer.ts";

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
  timeZone?: string;
  userAgent?: string;
};

const topicFeedsPath = "/bbs/app/topic/feeds";

export function createHeyboxTopicSource(config: HeyboxTopicSourceConfig = {}): TopicSource {
  const apiBaseUrl = config.apiBaseUrl ?? "https://api.xiaoheihe.cn";
  const appBuild = config.appBuild ?? "1107";
  const appVersion = config.appVersion ?? "1.3.390";
  const channel = config.channel ?? "heybox";
  const deviceInfo = config.deviceInfo ?? "FNE-AN00";
  const deviceId = config.deviceId ?? crypto.randomUUID().replaceAll("-", "");
  const dw = config.dw ?? "617";
  const fetchFn = config.fetchFn ?? fetch;
  const heyboxId = config.heyboxId ?? "-1";
  const osVersion = config.osVersion ?? "9";
  const timeZone = config.timeZone ?? "Asia/Shanghai";
  const userAgent = config.userAgent ??
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 " +
      "Safari/537.36 ApiMaxJia/1.0";

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
        build: appBuild,
        channel,
        device_info: deviceInfo,
        dw,
        heybox_id: heyboxId,
        hkey: signature.hkey,
        imei: deviceId,
        limit: String(limit),
        nonce: signature.nonce,
        offset: "0",
        os_type: "Android",
        os_version: osVersion,
        time_zone: timeZone,
        topic_id: topicId,
        version: appVersion,
        x_app: "heybox",
        x_client_type: "mobile",
        x_os_type: "Android",
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
        throw new Error(`Heybox topic feed request failed with HTTP ${response.status}`);
      }

      const payload = await response.json();
      assertHeyboxOk(payload);
      assertRequestedSortApplied(payload, options.sort);
      return parseHeyboxTopicPosts(payload, topicId).slice(0, limit);
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
