import {
  createHeyboxHblogTopicSource,
  parseHeyboxHblogTopicPosts,
} from "./heybox_hblog_topic_source.ts";

Deno.test("parseHeyboxHblogTopicPosts reads the latest matching publish-time feed", () => {
  const posts = parseHeyboxHblogTopicPosts(hblogFixture, "12099", "publishTime");

  assertEquals(posts.map((post) => post.id), ["newer-app-order", "older-app-order"]);
});

Deno.test("parseHeyboxHblogTopicPosts does not use smart-sort responses", () => {
  const posts = parseHeyboxHblogTopicPosts(hblogFixture, "12099", "smart");

  assertEquals(posts.map((post) => post.id), ["smart"]);
});

Deno.test("parseHeyboxHblogTopicPosts throws when requested sort is missing", () => {
  assertThrows(
    () => parseHeyboxHblogTopicPosts(hblogFixture, "12099", "replyTime"),
    "Heybox hblog does not contain topic_id=12099 sort_filter=reply",
  );
});

Deno.test("createHeyboxHblogTopicSource reads configured hblog path", async () => {
  const source = createHeyboxHblogTopicSource({
    logFilePath: "net-log",
    readTextFile: (path) => {
      assertEquals(path, "net-log");
      return Promise.resolve(hblogFixture);
    },
  });

  const posts = await source.listLatestPosts("12099", { limit: 1, sort: "publishTime" });

  assertEquals(posts.map((post) => post.id), ["newer-app-order"]);
});

const hblogFixture = [
  responseLine("sort_filter=hot-rank", "12099"),
  payloadLine([{ create_at: 300, linkid: "smart", title: "smart" }]),
  responseLine("sort_filter=create", "12099"),
  payloadLine([
    { create_at: 100, linkid: "old-create", title: "old create" },
  ]),
  responseLine("", "12099"),
  payloadLine([
    { create_at: 200, linkid: "newer-app-order", title: "newer in app order" },
    { create_at: 100, linkid: "older-app-order", title: "older in app order" },
  ], "create"),
].join("\n");

function responseLine(sortFilter: string, topicId: string): string {
  const sortQuery = sortFilter ? `&${sortFilter}` : "";
  return "2026-07-03 02:52:00.000 I/HBLog_Net: <-- 200 OK " +
    `https://api.xiaoheihe.cn/bbs/app/topic/feeds?topic_id=${topicId}&offset=0&limit=30${sortQuery}`;
}

function payloadLine(links: Array<Record<string, unknown>>, hSrcSortFilter = ""): string {
  return `2026-07-03 02:52:00.000 I/HBLog_Net: ${
    JSON.stringify({
      result: {
        links: hSrcSortFilter
          ? links.map((link) => ({ ...link, h_src: hSrcWithSortFilter(hSrcSortFilter) }))
          : links,
        sort_filter: [
          { key: "create", text: "发布时间" },
          { key: "hot-rank", text: "智能排序" },
          { key: "reply", text: "回复时间" },
        ],
      },
      status: "ok",
    })
  }`;
}

function hSrcWithSortFilter(sortFilter: string): string {
  return btoa(`app_share__sort_filter__${sortFilter}__topic_ids__12099__type_v2__4`);
}

function assertThrows(fn: () => unknown, expectedMessage: string): void {
  try {
    fn();
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
