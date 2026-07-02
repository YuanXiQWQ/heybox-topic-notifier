import type { TopicPost } from "../models.ts";
import type { TopicListOptions, TopicSource } from "./topic_source.ts";

export type WorkerTopicSourceConfig = {
  fetchFn?: typeof fetch;
  token?: string;
  workerUrl: string;
};

export function createWorkerTopicSource(config: WorkerTopicSourceConfig): TopicSource {
  const fetchFn = config.fetchFn ?? fetch;

  return {
    async listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]> {
      const url = new URL(config.workerUrl);
      url.searchParams.set("topic_id", topicId);
      url.searchParams.set("limit", String(options.limit));
      url.searchParams.set("sort", options.sort);

      const response = await fetchFn(url, {
        headers: {
          accept: "application/json",
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Topic worker request failed with HTTP ${response.status}`);
      }

      const payload = await response.json();
      return parseWorkerTopicPosts(payload);
    },
  };
}

export function parseWorkerTopicPosts(payload: unknown): TopicPost[] {
  const posts = arrayAt(payload, ["posts"]);
  return posts.map(topicPostFromUnknown).filter((post): post is TopicPost => post !== undefined);
}

function topicPostFromUnknown(value: unknown): TopicPost | undefined {
  const record = asRecord(value);
  const id = stringField(record, "id");
  const publishedAt = stringField(record, "publishedAt");
  const title = stringField(record, "title");
  const excerpt = stringField(record, "excerpt");
  const body = stringField(record, "body");

  if (!id || !publishedAt || (!title && !excerpt && !body)) {
    return undefined;
  }

  return {
    body,
    commentReplies: stringList(record.commentReplies),
    comments: stringList(record.comments),
    excerpt,
    id,
    publishedAt,
    title,
    url: stringField(record, "url"),
  };
}

function arrayAt(value: unknown, path: string[]): unknown[] {
  let current = value;

  for (const key of path) {
    current = asRecord(current)[key];
  }

  return Array.isArray(current) ? current : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];
}
