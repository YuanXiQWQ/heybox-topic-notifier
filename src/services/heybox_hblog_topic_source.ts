import type { PollSort, TopicPost } from "../models.ts";
import { heyboxSortFilter, parseHeyboxTopicPosts } from "./heybox_topic_source.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";

export type HeyboxHblogTopicSourceConfig = {
  logFilePath: string;
  readTextFile?: (path: string) => Promise<string>;
};

type TopicFeedLogEntry = {
  payload: unknown;
  sortFilter: string | null;
  topicId: string | null;
};

export function createHeyboxHblogTopicSource(config: HeyboxHblogTopicSourceConfig): TopicSource {
  const readTextFile = config.readTextFile ?? Deno.readTextFile;

  return {
    async listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]> {
      const logText = await readTextFile(config.logFilePath);
      return parseHeyboxHblogTopicPosts(logText, topicId, options.sort).slice(0, options.limit);
    },
  };
}

export function parseHeyboxHblogTopicPosts(
  logText: string,
  topicId: string,
  sort: PollSort,
): TopicPost[] {
  const expectedSortFilter = heyboxSortFilter(sort);
  const entries = parseTopicFeedLogEntries(logText);
  const entry = entries.findLast((entry) =>
    entry.topicId === topicId && entry.sortFilter === expectedSortFilter
  );

  if (!entry) {
    throw new Error(
      `Heybox hblog does not contain topic_id=${topicId} sort_filter=${expectedSortFilter}`,
    );
  }

  return parseHeyboxTopicPosts(entry.payload, topicId);
}

function parseTopicFeedLogEntries(logText: string): TopicFeedLogEntry[] {
  const entries: TopicFeedLogEntry[] = [];
  let pendingUrl: URL | undefined;

  for (const line of logText.split(/\r?\n/)) {
    const responseUrl = topicFeedResponseUrl(line);
    if (responseUrl) {
      pendingUrl = responseUrl;
      continue;
    }

    const matchedUrl = pendingUrl;
    if (!matchedUrl) {
      continue;
    }

    const payload = hblogPayload(line);
    if (!payload) {
      continue;
    }

    if (hasTopicLinks(payload)) {
      entries.push({
        payload,
        sortFilter: matchedUrl.searchParams.get("sort_filter"),
        topicId: matchedUrl.searchParams.get("topic_id"),
      });
    }

    pendingUrl = undefined;
  }

  return entries;
}

function topicFeedResponseUrl(line: string): URL | undefined {
  const [, rawUrl = ""] =
    line.match(/<-- 200 OK (https:\/\/api\.xiaoheihe\.cn\/bbs\/app\/topic\/feeds\?\S+)/) ?? [];
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function hblogPayload(line: string): unknown | undefined {
  const marker = "I/HBLog_Net: ";
  const index = line.indexOf(`${marker}{`);
  if (index < 0) {
    return undefined;
  }

  try {
    return JSON.parse(line.slice(index + marker.length));
  } catch {
    return undefined;
  }
}

function hasTopicLinks(payload: unknown): boolean {
  return Array.isArray(asRecord(asRecord(payload).result).links);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
