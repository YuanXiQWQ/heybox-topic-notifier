/**
 * @file 本文件验证小黑盒话题数据源的请求构建和响应解析逻辑。
 */
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
          share_url:
            "https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_src=YXBwX3NoYXJl&link_id=abc",
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
      id: "abc",
      publishedAt: "2026-06-30T18:01:41.000Z",
      title: "post title",
      url: "https://www.xiaoheihe.cn/app/bbs/link/abc",
    },
  ]);
});

Deno.test("parseHeyboxTopicPosts rejects untrusted post share URLs", () => {
  const posts = parseHeyboxTopicPosts({
    result: {
      links: [
        {
          id: "unsafe-protocol",
          share_url: "javascript:alert(1)",
          title: "unsafe protocol",
        },
        {
          id: "unsafe-host",
          share_url: "https://evil.example.com/app/bbs/link/unsafe-host",
          title: "unsafe host",
        },
        {
          id: "unsafe-http",
          share_url: "http://www.xiaoheihe.cn/app/bbs/link/unsafe-http",
          title: "unsafe http",
        },
      ],
    },
    status: "ok",
  }, "topic/unsafe");

  assertEquals(posts.map((post) => post.url), [
    "https://www.xiaoheihe.cn/app/topic/link/topic%2Funsafe",
    "https://www.xiaoheihe.cn/app/topic/link/topic%2Funsafe",
    "https://www.xiaoheihe.cn/app/topic/link/topic%2Funsafe",
  ]);
});

Deno.test("parseHeyboxTopicPosts keeps trusted Heybox post share URLs", () => {
  const posts = parseHeyboxTopicPosts({
    result: {
      links: [
        {
          id: "trusted-topic",
          share_url: "https://www.xiaoheihe.cn/app/topic/link/12099?tab=hot#latest",
          title: "trusted topic",
        },
      ],
    },
    status: "ok",
  }, "12099");

  assertEquals(posts[0].url, "https://www.xiaoheihe.cn/app/topic/link/12099?tab=hot#latest");
});

Deno.test("parseHeyboxTopicPosts encodes extracted link IDs in post URLs", () => {
  const posts = parseHeyboxTopicPosts({
    result: {
      links: [
        {
          share_url: "https://api.xiaoheihe.cn/share?link_id=abc%2F..%2F%3Cscript%3E",
          title: "encoded link id",
        },
      ],
    },
    status: "ok",
  }, "12099");

  assertEquals(posts[0].url, "https://www.xiaoheihe.cn/app/bbs/link/abc%2F..%2F%3Cscript%3E");
});

Deno.test("createHeyboxTopicSource requests signed topic feed", async () => {
  const requestedUrls: URL[] = [];
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    deviceId: "device-1",
    fetchFn: (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);

      if (url.pathname === "/bbs/app/link/tree") {
        return Promise.resolve(Response.json({
          result: {
            link: {
              create_at: 1782842501,
              linkid: 1,
              title: "hello",
            },
          },
          status: "ok",
        }));
      }

      return Promise.resolve(Response.json({
        result: {
          links: [
            {
              create_at: 1782850000,
              linkid: 1,
              title: "hello",
            },
          ],
          sort_filter: [
            { key: "create", text: "发布时间" },
            { key: "hot-rank", text: "智能排序" },
            { key: "reply", text: "回复时间" },
          ],
        },
        status: "ok",
      }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  const posts = await source.listLatestPosts("12099", { limit: 3, sort: "smart" });
  const detailedPost = await source.getPostDetails?.(posts[0]);

  const topicFeedUrl = requestedUrls.find((url) => url.pathname === "/bbs/app/topic/feeds");
  const detailUrl = requestedUrls.find((url) => url.pathname === "/bbs/app/link/tree");

  if (!topicFeedUrl || !detailUrl) {
    throw new Error("Expected topic feed and detail request URLs to be captured");
  }

  assertEquals(topicFeedUrl.origin, "https://api.example.test");
  assertEquals(topicFeedUrl.searchParams.get("topic_id"), "12099");
  assertEquals(topicFeedUrl.searchParams.get("imei"), "device-1");
  assertEquals(topicFeedUrl.searchParams.get("limit"), "3");
  assertEquals(topicFeedUrl.searchParams.get("sort_filter"), "hot-rank");
  assertEquals(topicFeedUrl.searchParams.get("x_client_type"), "mobile");
  assertEquals(topicFeedUrl.searchParams.get("x_app"), "heybox");
  assertEquals(topicFeedUrl.searchParams.get("version"), "1.3.232");
  assertEquals(topicFeedUrl.searchParams.get("build"), "783");
  assertEquals(topicFeedUrl.searchParams.get("channel"), "heybox_wandoujia");
  assertEquals(topicFeedUrl.searchParams.get("device_info"), "M2104K10AC");
  assertEquals(topicFeedUrl.searchParams.get("os_version"), "14");
  assertEquals(topicFeedUrl.searchParams.get("dw"), "393");
  assertEquals(topicFeedUrl.searchParams.has("hkey"), true);
  assertEquals(topicFeedUrl.searchParams.has("nonce"), true);
  assertEquals(topicFeedUrl.searchParams.get("_time"), "1782848432");
  assertEquals(detailUrl.searchParams.get("link_id"), "1");
  assertEquals(posts[0].id, "1");
  assertEquals(detailedPost?.publishedAt, "2026-06-30T18:01:41.000Z");
});

Deno.test("createHeyboxTopicSource orders publish-time feed before slicing", async () => {
  let topicFeedUrl: URL | undefined;
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    fetchFn: (input) => {
      topicFeedUrl = new URL(String(input));
      return Promise.resolve(Response.json({
        result: {
          links: [
            { create_at: 1782840000, linkid: "older", title: "older" },
            { create_at: 1782850000, linkid: "newer", title: "newer" },
            { create_at: 1782845000, linkid: "middle", title: "middle" },
          ],
          sort_filter: [
            { key: "create", text: "发布时间" },
            { key: "hot-rank", text: "智能排序" },
            { key: "reply", text: "回复时间" },
          ],
        },
        status: "ok",
      }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  const posts = await source.listLatestPosts("12099", { limit: 2, sort: "publishTime" });

  if (!topicFeedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(topicFeedUrl.searchParams.get("limit"), "30");
  assertEquals(topicFeedUrl.searchParams.get("sort_filter"), "create");
  assertEquals(posts.map((post) => post.id), ["newer", "middle"]);
});

Deno.test("createHeyboxTopicSource maps reply time sort to Heybox reply", async () => {
  let requestedUrl: URL | undefined;
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    fetchFn: (input) => {
      requestedUrl = new URL(String(input));
      return Promise.resolve(Response.json({
        result: {
          links: [],
          sort_filter: [
            { key: "create", text: "发布时间" },
            { key: "hot-rank", text: "智能排序" },
            { key: "reply", text: "回复时间" },
          ],
        },
        status: "ok",
      }));
    },
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  await source.listLatestPosts("12099", { limit: 10, sort: "replyTime" });

  if (!requestedUrl) {
    throw new Error("Expected request URL to be captured");
  }

  assertEquals(requestedUrl.searchParams.get("sort_filter"), "reply");
});

Deno.test("createHeyboxTopicSource rejects ignored publish time sort", async () => {
  const source = createHeyboxTopicSource({
    apiBaseUrl: "https://api.example.test",
    fetchFn: () =>
      Promise.resolve(Response.json({
        result: {
          links: [],
          sort_filter: [{ key: "hot-rank", text: "智能排序" }],
        },
        status: "ok",
      })),
    now: () => new Date(1782848432 * 1000),
    random: () => 0.123,
  });

  await assertRejects(
    () => source.listLatestPosts("12099", { limit: 10, sort: "publishTime" }),
    "Heybox topic feed did not apply requested sort_filter=create",
  );
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

/**
 * 断言异步函数会抛出指定错误信息。
 *
 * @param fn 待执行的异步函数。
 * @param expectedMessage 期望的错误信息。
 * @return 断言通过时无返回值。
 */
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

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
