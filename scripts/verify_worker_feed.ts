import type { PollSort } from "../src/models.ts";
import { createWorkerTopicSource } from "../src/services/worker_topic_source.ts";

const topicId = requiredEnv("HEYBOX_TOPIC_ID");
const workerUrl = requiredEnv("TOPIC_WORKER_URL");
const token = Deno.env.get("TOPIC_WORKER_TOKEN") ?? undefined;
const limit = positiveIntegerFromEnv("POLL_POST_LIMIT", 20);
const sort = pollSortFromEnv();

const source = createWorkerTopicSource({ token, workerUrl });
const posts = await source.listLatestPosts(topicId, { limit, sort });

if (posts.length === 0) {
  throw new Error("Worker feed returned no valid posts");
}

const invalidDatePost = posts.find((post) => Number.isNaN(Date.parse(post.publishedAt)));
if (invalidDatePost) {
  throw new Error(`Worker feed post ${invalidDatePost.id} has invalid publishedAt`);
}

console.log(
  JSON.stringify(
    {
      firstPost: {
        id: posts[0].id,
        publishedAt: posts[0].publishedAt,
        title: posts[0].title,
      },
      limit,
      postCount: posts.length,
      sort,
      topicId,
    },
    null,
    2,
  ),
);

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pollSortFromEnv(): PollSort {
  const value = Deno.env.get("POLL_SORT");
  if (value === "publishTime" || value === "smart" || value === "replyTime") {
    return value;
  }
  return "publishTime";
}
