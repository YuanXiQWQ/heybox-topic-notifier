import type { PollSort } from "../src/models.ts";
import { parseHeyboxHblogTopicPosts } from "../src/services/heybox_hblog_topic_source.ts";

const logPath = requiredEnv("HEYBOX_HBLOG_NET_LOG");
const outputPath = Deno.env.get("WORKER_FEED_OUTPUT")?.trim() || "worker-feed.json";
const postLimit = positiveIntegerFromEnv("POLL_POST_LIMIT", 20);
const sort = pollSortFromEnv();
const topicId = requiredEnv("HEYBOX_TOPIC_ID");

const logText = await Deno.readTextFile(logPath);
const posts = parseHeyboxHblogTopicPosts(logText, topicId, sort).slice(0, postLimit);

if (posts.length === 0) {
  throw new Error("Hblog worker feed produced no posts");
}

await Deno.writeTextFile(outputPath, JSON.stringify({ posts }, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      firstPost: {
        id: posts[0].id,
        publishedAt: posts[0].publishedAt,
        title: posts[0].title,
      },
      outputPath,
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
