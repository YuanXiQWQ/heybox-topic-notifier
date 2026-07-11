import { parseWorkerTopicPosts } from "../src/services/worker_topic_source.ts";

const feedPath = Deno.env.get("WORKER_FEED_OUTPUT")?.trim() || "worker-feed.json";
const payload = JSON.parse(await Deno.readTextFile(feedPath));
const posts = parseWorkerTopicPosts(payload);

if (posts.length === 0) {
  throw new Error(`${feedPath} contains no valid worker feed posts`);
}

const invalidDatePost = posts.find((post) => Number.isNaN(Date.parse(post.publishedAt)));
if (invalidDatePost) {
  throw new Error(`${feedPath} post ${invalidDatePost.id} has invalid publishedAt`);
}

console.log(
  JSON.stringify(
    {
      feedPath,
      firstPost: {
        id: posts[0].id,
        publishedAt: posts[0].publishedAt,
        title: posts[0].title,
      },
      postCount: posts.length,
    },
    null,
    2,
  ),
);
