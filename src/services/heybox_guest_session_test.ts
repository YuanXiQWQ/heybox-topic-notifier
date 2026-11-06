/** @file 验证匿名会话复用、失效恢复、验证码退避和详情解析链路。 */
import { assert, assertEquals, assertRejects } from "../test_helpers.ts";
import {
  createGuestDetailFetch,
  guestDetailEndpoint,
  type HeyboxGuestSession,
} from "./heybox_guest_session.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import { withDetailRelay } from "./heybox_detail_relay.ts";
import { withDetailFailover } from "./heybox_detail_failover.ts";
import type { TopicPost } from "../models.ts";
import { buildHkey } from "./heybox_signer.ts";

/** 测试用公开帖，仅使用虚构正文和令牌。 */
const post: TopicPost = {
  id: "abc",
  title: "列表标题",
  body: "摘要",
  excerpt: "摘要",
  comments: [],
  commentReplies: [],
  publishedAt: "",
  url: "https://www.xiaoheihe.cn/app/bbs/link/abc",
};

/**
 * 创建不含真实凭据的官网会话替身。
 * @param {number} expiresAt 有效期。
 * @return {HeyboxGuestSession} 虚构会话。
 */
function session(expiresAt = 1e15): HeyboxGuestSession {
  return {
    template:
      `${guestDetailEndpoint}?app=heybox&link_id=old&hkey=old&nonce=old&_time=1`,
    cookie: "x_xhh_tokenid=test-device",
    userAgent: "Test browser",
    expiresAt,
  };
}

/**
 * 创建正文与评论包含富文本的合法接口响应。
 * @param {string} id 请求帖子编号。
 * @return {Response} 完整详情响应。
 */
function detail(id = "abc"): Response {
  return Response.json({
    status: "ok",
    result: {
      link: {
        title: "这里怎么通过？",
        linkid: id,
        text: '[{"type":"text","text":"我录制还没开呢"}]',
        comment_list: [{ content: "正文评论" }],
      },
    },
  });
}

Deno.test("anonymous session initializes once and uses fresh web signatures across posts", async () => {
  let initializes = 0;
  const nonces = new Set<string>();
  const read = createGuestDetailFetch({
    initialize: () => {
      initializes++;
      return Promise.resolve(session());
    },
    fetchFn: (input, init) => {
      const url = new URL(String(input));
      assertEquals(url.origin + url.pathname, guestDetailEndpoint);
      assertEquals(init?.redirect, "error");
      assertEquals(
        new Headers(init?.headers).get("cookie"),
        "x_xhh_tokenid=test-device",
      );
      const nonce = url.searchParams.get("nonce")!;
      nonces.add(nonce);
      assertEquals(
        url.searchParams.get("hkey"),
        buildHkey(url.pathname, Number(url.searchParams.get("_time")), nonce),
      );
      return Promise.resolve(detail(url.searchParams.get("link_id")!));
    },
  });
  const responses = await Promise.all([read("abc"), read("def")]);
  for (const response of responses) await response.body?.cancel();
  assertEquals(initializes, 1);
  assertEquals(nonces.size, 2);
});

Deno.test("anonymous details preserve existing parsing, list content and Deno fallback", async () => {
  let initializeCalls = 0, backupCalls = 0;
  const primary = createHeyboxTopicSource({
    fetchDetail: createGuestDetailFetch({
      initialize: () => {
        initializeCalls++;
        return Promise.resolve(session());
      },
      fetchFn: () => Promise.resolve(detail()),
    }),
  });
  const source = withDetailFailover(primary, {
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: (post) => {
      backupCalls++;
      return Promise.resolve({
        ...post,
        detailsComplete: true,
        body: "备用正文",
      });
    },
  });
  const result = await source.getPostDetails!(post);
  assertEquals(result.detailsComplete, true);
  assertEquals(result.body, "我录制还没开呢");
  assertEquals(result.comments, ["正文评论"]);
  assertEquals(result.url, post.url);
  assertEquals(initializeCalls, 1);
  assertEquals(backupCalls, 0);
  const failed = createHeyboxTopicSource({
    fetchDetail: createGuestDetailFetch({
      initialize: () =>
        Promise.reject(new Error("private data must not escape")),
    }),
  });
  const fallback = withDetailFailover(failed, {
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: (post) =>
      Promise.resolve({
        ...post,
        detailsComplete: true,
        body: "备用正文",
      }),
  });
  assertEquals((await fallback.getPostDetails!(post)).body, "备用正文");
});

Deno.test("CAPTCHA preserves anonymous identity and stops requests for fifteen minutes", async () => {
  let now = 1000, initializes = 0, requests = 0;
  const read = createGuestDetailFetch({
    now: () => now,
    initialize: () => {
      initializes++;
      return Promise.resolve(session());
    },
    fetchFn: () => {
      requests++;
      return Promise.resolve(Response.json({ status: "show_captcha" }));
    },
  });
  await (await read("abc")).body?.cancel();
  await assertRejects(() => read("def"), "cooling down");
  assertEquals(requests, 1);
  now += 900000;
  await (await read("def")).body?.cancel();
  assertEquals(initializes, 1);
  assertEquals(requests, 2);
});

Deno.test("missing token defers refresh instead of retrying within the request budget", async () => {
  let now = 1000, initializes = 0, requests = 0;
  const read = createGuestDetailFetch({
    now: () => now,
    initialize: () => {
      initializes++;
      return Promise.resolve(session());
    },
    fetchFn: () => {
      requests++;
      return Promise.resolve(
        requests === 1 ? Response.json({ status: "lack_token" }) : detail(),
      );
    },
  });
  await (await read("abc")).body?.cancel();
  await assertRejects(() => read("abc"), "cooling down");
  assertEquals(initializes, 1);
  now += 60000;
  await (await read("abc")).body?.cancel();
  assertEquals(initializes, 2);
  assertEquals(requests, 2);
});

Deno.test("expired anonymous session refreshes and initialization failure backs off safely", async () => {
  let now = 1000, calls = 0;
  const read = createGuestDetailFetch({
    now: () => now,
    initialize: () => {
      calls++;
      return calls === 2
        ? Promise.reject(new Error("sensitive cookie"))
        : Promise.resolve(session(now + 1000));
    },
    fetchFn: () => Promise.resolve(detail()),
  });
  await (await read("abc")).body?.cancel();
  now += 1000;
  await assertRejects(() => read("abc"), "Anonymous details unavailable");
  await assertRejects(() => read("abc"), "cooling down");
  assertEquals(calls, 2);
  now += 60000;
  await (await read("abc")).body?.cancel();
  assertEquals(calls, 3);
});

Deno.test("anonymous transport rejects foreign origins, malformed credentials and oversized responses", async () => {
  for (
    const value of [
      { ...session(), template: "https://evil.example/bbs/app/link/tree" },
      {
        ...session(),
        template: "https://user:pass@api.xiaoheihe.cn/bbs/app/link/tree",
      },
      { ...session(), cookie: "x_xhh_tokenid=test; account=secret" },
      { ...session(), userAgent: "browser\r\ninjected: header" },
    ]
  ) {
    const read = createGuestDetailFetch({
      initialize: () => Promise.resolve(value),
      fetchFn: () => {
        throw new Error("Must not fetch");
      },
    });
    await assertRejects(() => read("abc"), "Anonymous details unavailable");
  }
  const read = createGuestDetailFetch({
    initialize: () => Promise.resolve(session()),
    fetchFn: () => Promise.resolve(new Response("x".repeat(1024 * 1024 + 1))),
  });
  await assertRejects(() => read("../other"), "Invalid post id");
  await assertRejects(() => read("abc"), "Anonymous details unavailable");
});

Deno.test("local relay requires explicit IPv4 loopback and keeps remote HTTPS enforcement", async () => {
  const source = { listLatestPosts: () => Promise.resolve([]) };
  const token = "test".repeat(8);
  for (
    const url of [
      "http://localhost:8788/v1/details",
      "http://127.0.0.1.evil.example/v1/details",
      "http://192.168.1.1/v1/details",
      "https://relay.example/v1/details",
    ]
  ) {
    await assertRejects(
      () =>
        Promise.resolve(withDetailRelay(source, { url, token, local: true })),
      "Invalid detail relay",
    );
  }
  await assertRejects(
    () =>
      Promise.resolve(
        withDetailRelay(source, {
          url: "http://127.0.0.1:8788/v1/details",
          token,
        }),
      ),
    "Invalid detail relay",
  );
  const client = withDetailRelay(source, {
    url: "http://127.0.0.1:8788/v1/details",
    token,
    local: true,
    fetchFn: (_url, init) => {
      assert(init?.signal);
      return Promise.resolve(
        Response.json({ ...post, body: "完整正文", detailsComplete: true }),
      );
    },
  });
  assertEquals((await client.getPostDetails!(post)).body, "完整正文");
});
