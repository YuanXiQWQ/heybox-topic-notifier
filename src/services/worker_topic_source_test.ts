import {
  createWorkerTopicSource,
  parseWorkerTopicPosts,
  workerFeedUrl,
} from "./worker_topic_source.ts";

Deno.test("createWorkerTopicSource requests worker feed", async () => {
  let requestedUrl: URL | undefined;
  let authorization = "";
  const source = createWorkerTopicSource({
    fetchFn: (input, init) => {
      requestedUrl = new URL(String(input));
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Promise.resolve(Response.json({
        posts: [
          {
            body: "body",
            commentReplies: ["reply"],
            comments: ["comment"],
            excerpt: "excerpt",
            id: "post-1",
            publishedAt: "2026-07-02T17:25:34.000Z",
            title: "title",
            url: "https://example.test/post-1",
          },
        ],
      }));
    },
    token: "worker-token",
    workerUrl: "https://worker.example.test/feed",
  });

  const posts = await source.listLatestPosts("12099", { limit: 3, sort: "publishTime" });

  if (!requestedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(requestedUrl.origin, "https://worker.example.test");
  assertEquals(requestedUrl.pathname, "/feed");
  assertEquals(requestedUrl.searchParams.get("topic_id"), "12099");
  assertEquals(requestedUrl.searchParams.get("limit"), "3");
  assertEquals(requestedUrl.searchParams.get("sort"), "publishTime");
  assertEquals(authorization, "Bearer worker-token");
  assertEquals(posts[0].id, "post-1");
});

Deno.test("parseWorkerTopicPosts filters invalid records", () => {
  const posts = parseWorkerTopicPosts({
    posts: [
      { id: "ok", publishedAt: "2026-07-02T17:25:34.000Z", title: "title" },
      { id: "", publishedAt: "2026-07-02T17:25:34.000Z", title: "missing id" },
      { id: "missing content", publishedAt: "2026-07-02T17:25:34.000Z" },
    ],
  });

  assertEquals(posts.map((post) => post.id), ["ok"]);
});

Deno.test("workerFeedUrl supports static feed URL templates", () => {
  const url = workerFeedUrl(
    "https://static.example.test/feeds/{topic_id}/{sort}-{limit}.json",
    "12099",
    { limit: 20, sort: "publishTime" },
  );

  assertEquals(url.href, "https://static.example.test/feeds/12099/publishTime-20.json");
});

Deno.test("createWorkerTopicSource throws on HTTP failure", async () => {
  const source = createWorkerTopicSource({
    fetchFn: () => Promise.resolve(new Response("failed", { status: 503 })),
    workerUrl: "https://worker.example.test/feed",
  });

  await assertRejects(
    () => source.listLatestPosts("12099", { limit: 3, sort: "publishTime" }),
    "Topic worker request failed with HTTP 503",
  );
});

async function assertRejects(fn: () => Promise<unknown>, expectedMessage: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }
    throw new Error(`Expected ${expectedMessage}, got ${String(error)}`);
  }

  throw new Error(`Expected ${expectedMessage}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
