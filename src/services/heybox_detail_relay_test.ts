/** @file 验证独立详情出口的鉴权、目标限制、缓存去重、边界及完整性。 */
import { assertEquals, assertRejects } from "../test_helpers.ts";
import {
  createDetailRelayHandler,
  withDetailRelay,
} from "./heybox_detail_relay.ts";
import type { TopicPost } from "../models.ts";
import type { TopicSource } from "./topic_source.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";

/** 固定测试密钥不具备生产访问权限。 */
const token = "test-only-detail-relay-token-00000000";
/** 测试用公开帖子结构。 */
const post: TopicPost = {
  id: "abc123",
  title: "这个该咋过去",
  body: "zsbd",
  excerpt: "",
  comments: [],
  commentReplies: [],
  publishedAt: "2026-11-04",
  url: "https://www.xiaoheihe.cn/app/bbs/link/abc123",
};

Deno.test("a later relay server error cannot shorten a concurrent restriction cooldown", async () => {
  let now = 1000;
  let calls = 0;
  const requests = [
    Promise.withResolvers<Response>(),
    Promise.withResolvers<Response>(),
  ];
  const client = withDetailRelay(
    { listLatestPosts: () => Promise.resolve([]) },
    {
      url: "https://relay.example/v1/details",
      token,
      now: () => now,
      fetchFn: () => requests[calls++].promise,
    },
  );
  const restricted = client.getPostDetails!(post);
  const failing = client.getPostDetails!({ ...post, id: "another" });
  requests[0].resolve(new Response(null, { status: 429 }));
  await restricted;
  now += 1000;
  requests[1].resolve(new Response(null, { status: 503 }));
  await failing;
  assertEquals(client.detailRetryAfter!(), 899);
  await client.getPostDetails!(post);
  assertEquals(calls, 2);
});

Deno.test("deleted Heybox content does not block subsequent valid details through the relay", async () => {
  let calls = 0;
  const source = createHeyboxTopicSource({
    fetchFn: (input) => {
      calls++;
      const id = new URL(String(input)).searchParams.get("link_id");
      return Promise.resolve(
        Response.json(
          id === "deleted"
            ? { status: "failed", msg: "该内容已被删除", result: {} }
            : {
              status: "ok",
              result: {
                link: { linkid: id, title: "怎么通过？", text: "zsbd" },
              },
            },
        ),
      );
    },
  });
  const handler = createDetailRelayHandler({ token, source });
  const client = withDetailRelay(source, {
    url: "https://relay.example/v1/details",
    token,
    fetchFn: (url, init) => handler(new Request(url, init)),
  });
  const deleted = await client.getPostDetails!({ ...post, id: "deleted" });
  assertEquals(deleted.detailsComplete, false);
  assertEquals(deleted.detailUnavailable, "deleted");
  assertEquals(deleted.body, "zsbd");
  assertEquals(
    (await client.getPostDetails!({ ...post, id: "deleted" }))
      .detailUnavailable,
    "deleted",
  );
  assertEquals(source.detailRetryAfter!(), 0);
  const complete = await client.getPostDetails!(post);
  assertEquals(complete.detailsComplete, true);
  assertEquals(complete.body, "zsbd");
  assertEquals(calls, 2);
});

Deno.test("generic unavailable responses cannot become terminal deleted posts", async () => {
  for (const status of [404, 410, 422, 503]) {
    const client = withDetailRelay({
      listLatestPosts: () => Promise.resolve([]),
    }, {
      url: "https://relay.example/v1/details",
      token,
      fetchFn: () =>
        Promise.resolve(
          Response.json({ id: "wrong", reason: "deleted" }, { status }),
        ),
    });
    const unavailable = await client.getPostDetails!(post);
    assertEquals(unavailable.detailsComplete, false);
    assertEquals(unavailable.detailUnavailable, undefined);
    assertEquals(unavailable.body, post.body);
  }
});

/**
 * 构建固定出口请求。
 * @param {unknown} payload 请求 JSON。
 * @param {string} authorization 鉴权头。
 * @return {Request} POST 请求。
 */
function request(
  payload: unknown = { id: post.id },
  authorization = `Bearer ${token}`,
): Request {
  return new Request("https://relay.example/v1/details", {
    method: "POST",
    headers: { authorization },
    body: JSON.stringify(payload),
  });
}

Deno.test("detail relay authenticates before upstream access and rejects arbitrary targets", async () => {
  let calls = 0;
  const source: TopicSource = {
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: () => {
      calls++;
      return Promise.resolve({ ...post, detailsComplete: true });
    },
  };
  const handler = createDetailRelayHandler({ token, source });
  assertEquals((await handler(request({}, ""))).status, 401);
  assertEquals((await handler(request({}, "Bearer wrong"))).status, 401);
  for (
    const payload of [{ id: "http://localhost" }, {
      id: post.id,
      url: "https://evil.example",
    }, { id: "x".repeat(2000) }]
  ) {
    assertEquals((await handler(request(payload))).status, 400);
  }
  assertEquals(
    (await handler(new Request("https://relay.example/v1/details"))).status,
    404,
  );
  assertEquals(
    (await handler(new Request("https://relay.example/healthz"))).status,
    200,
  );
  assertEquals(calls, 0);
});

Deno.test("relay request budget covers concurrent posts, preserves cached hits and resumes the queue", async () => {
  let now = 1000, requests = 0;
  const client = withDetailRelay({
    listLatestPosts: () => Promise.resolve([]),
  }, {
    url: "https://relay.example/v1/details",
    token,
    requestsPerMinute: 3,
    now: () => now,
    fetchFn: (_url, init) => {
      requests++;
      const { id } = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({ ...post, id, detailsComplete: true }),
      );
    },
  });
  const results = await Promise.all(
    ["a", "b", "c", "d"].map((id) => client.getPostDetails!({ ...post, id })),
  );
  assertEquals(requests, 3);
  assertEquals(results[3].detailDeferredUntil, 61000);
  assertEquals(results[3].body, post.body);
  assertEquals(
    (await client.getPostDetails!({ ...post, id: "a" })).detailsComplete,
    true,
  );
  assertEquals(requests, 3);
  now = 60999;
  assertEquals(
    (await client.getPostDetails!(results[3])).detailsComplete,
    false,
  );
  assertEquals(requests, 3);
  now = 61000;
  const resumed = await client.getPostDetails!(results[3]);
  assertEquals(resumed.detailsComplete, true);
  assertEquals(resumed.detailDeferredUntil, undefined);
  assertEquals(requests, 4);
});

Deno.test("detail relay client and server deduplicate concurrent and repeated requests with expiry", async () => {
  let now = 0, upstreamCalls = 0, relayCalls = 0, listCalls = 0;
  const source: TopicSource = {
    listLatestPosts: () => {
      listCalls++;
      return Promise.resolve([post]);
    },
    getPostDetails: () => {
      upstreamCalls++;
      return Promise.resolve({
        ...post,
        body: "完整正文",
        detailsComplete: true,
      });
    },
  };
  const handler = createDetailRelayHandler({ token, source, now: () => now });
  const client = withDetailRelay(source, {
    url: "https://relay.example/v1/details",
    token,
    now: () => now,
    fetchFn: (url, init) => {
      relayCalls++;
      return handler(new Request(url, init));
    },
  });
  const results = await Promise.all([
    client.getPostDetails!(post),
    client.getPostDetails!(post),
  ]);
  assertEquals(results[0].body, "完整正文");
  results[0].comments.push("本机修改");
  assertEquals(results[1].comments, []);
  assertEquals((await client.getPostDetails!(post)).comments, []);
  assertEquals(relayCalls, 1);
  assertEquals(upstreamCalls, 1);
  assertEquals(
    (await client.listLatestPosts("12099", { limit: 20, sort: "publishTime" }))
      .length,
    1,
  );
  assertEquals(listCalls, 1);
  now += 120001;
  await client.getPostDetails!(post);
  assertEquals(upstreamCalls, 2);
});

Deno.test("relay unavailable details remain retryable and are never cached as success", async () => {
  let complete = false, calls = 0, now = 0;
  const source: TopicSource = {
    detailRetryAfter: () => complete ? 0 : 900,
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: () => {
      calls++;
      return Promise.resolve({ ...post, detailsComplete: complete });
    },
  };
  const handler = createDetailRelayHandler({ token, source });
  const client = withDetailRelay(source, {
    url: "https://relay.example/v1/details",
    token,
    now: () => now,
    fetchFn: (url, init) => handler(new Request(url, init)),
  });
  assertEquals((await client.getPostDetails!(post)).detailsComplete, false);
  complete = true;
  assertEquals((await client.getPostDetails!(post)).detailsComplete, false);
  assertEquals(calls, 1);
  now += 900001;
  assertEquals((await client.getPostDetails!(post)).detailsComplete, true);
  assertEquals(calls, 2);
});

Deno.test("a missing post does not block complete details for other posts", async () => {
  let calls = 0;
  const source: TopicSource = {
    listLatestPosts: () => Promise.resolve([]),
    getPostDetails: (value) => {
      calls++;
      return Promise.resolve({
        ...value,
        body: "完整正文",
        detailsComplete: value.id !== post.id,
      });
    },
  };
  const handler = createDetailRelayHandler({ token, source });
  const client = withDetailRelay(source, {
    url: "https://relay.example/v1/details",
    token,
    fetchFn: (url, init) => handler(new Request(url, init)),
  });
  assertEquals(await client.getPostDetails!(post), {
    ...post,
    detailsComplete: false,
  });
  assertEquals(
    (await client.getPostDetails!({ ...post, id: "abc124" })).detailsComplete,
    true,
  );
  assertEquals(calls, 2);
});

Deno.test("relay rejects mismatched ids, oversized replies and malformed posts without losing list content", async () => {
  const source: TopicSource = { listLatestPosts: () => Promise.resolve([]) };
  const responses = [
    { ...post, id: "different", detailsComplete: true },
    { ...post, body: "x".repeat(1024 * 1024), detailsComplete: true },
    { ...post, comments: [123], detailsComplete: true },
    { ...post, detailsComplete: false },
  ];
  for (const response of responses) {
    const client = withDetailRelay(source, {
      url: "https://relay.example/v1/details",
      token,
      fetchFn: () => Promise.resolve(Response.json(response)),
    });
    assertEquals(await client.getPostDetails!(post), {
      ...post,
      detailsComplete: false,
    });
  }
  await assertRejects(
    () =>
      Promise.resolve(
        withDetailRelay(source, { url: "http://relay.example", token }),
      ),
    "Invalid detail relay",
  );
  await assertRejects(
    () => Promise.resolve(createDetailRelayHandler({ token: "weak", source })),
    "at least 32",
  );
});
