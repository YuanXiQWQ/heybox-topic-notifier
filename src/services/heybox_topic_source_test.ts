import { createHeyboxTopicSource, parseHeyboxTopicPosts } from "./heybox_topic_source.ts";

Deno.test("parseHeyboxTopicPosts maps Heybox links to topic posts", () => {
  const posts = parseHeyboxTopicPosts({
    result: {
      links: [
        {
          comment_list: [{ content: "first comment" }],
          create_at: 1782842501,
          description: "post summary",
          linkid: 184665213,
          reply_list: [{ reply: "first reply" }],
          share_url: "https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=abc",
          title: "post title",
        },
      ],
    },
    status: "ok",
  }, "12099");

  assertEquals(posts, [
    {
      body: "post summary",
      commentReplies: ["first reply"],
      comments: ["first comment"],
      excerpt: "post summary",
      id: "184665213",
      publishedAt: "2026-06-30T18:01:41.000Z",
      title: "post title",
      url: "https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=abc",
    },
  ]);
});

Deno.test("createHeyboxTopicSource requests signed topic feed", async () => {
  let requestedUrl: URL | undefined;
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    deviceId: "device-1",
    fetchFn: (input) => {
      requestedUrl = new URL(String(input));
      return Promise.resolve(Response.json({
        result: {
          links: [
            {
              create_at: 1782842501,
              linkid: 1,
              title: "hello",
            },
          ],
        },
        status: "ok",
      }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  const posts = await source.listLatestPosts("12099", { limit: 3, sort: "smart" });

  if (!requestedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(requestedUrl.origin, "https://api.example.test");
  assertEquals(requestedUrl.pathname, "/bbs/app/topic/feeds");
  assertEquals(requestedUrl.searchParams.get("topic_id"), "12099");
  assertEquals(requestedUrl.searchParams.get("device_id"), "device-1");
  assertEquals(requestedUrl.searchParams.get("limit"), "3");
  assertEquals(requestedUrl.searchParams.get("sort_filter"), "hot-rank");
  assertEquals(requestedUrl.searchParams.has("hkey"), true);
  assertEquals(requestedUrl.searchParams.has("nonce"), true);
  assertEquals(requestedUrl.searchParams.get("_time"), "1782848432");
  assertEquals(posts[0].id, "1");
});

Deno.test("createHeyboxTopicSource omits sort_filter for publish time", async () => {
  let requestedUrl: URL | undefined;
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    fetchFn: (input) => {
      requestedUrl = new URL(String(input));
      return Promise.resolve(Response.json({ result: { links: [] }, status: "ok" }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  await source.listLatestPosts("12099", { limit: 10, sort: "publishTime" });

  if (!requestedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(requestedUrl.searchParams.has("sort_filter"), false);
});

Deno.test("createHeyboxTopicSource maps reply time sort to Heybox comment-time", async () => {
  let requestedUrl: URL | undefined;
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    fetchFn: (input) => {
      requestedUrl = new URL(String(input));
      return Promise.resolve(Response.json({ result: { links: [] }, status: "ok" }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  await source.listLatestPosts("12099", { limit: 10, sort: "replyTime" });

  if (!requestedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(requestedUrl.searchParams.get("sort_filter"), "comment-time");
});

Deno.test("createHeyboxTopicSource throws on failed Heybox response", async () => {
  const source = createHeyboxTopicSource({
    fetchFn: () =>
      Promise.resolve(Response.json({
        msg: "illegal request",
        result: {},
        status: "failed",
      })),
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  await assertRejects(
    () => source.listLatestPosts("12099", { limit: 20, sort: "publishTime" }),
    "Heybox topic feed request failed: illegal request",
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
