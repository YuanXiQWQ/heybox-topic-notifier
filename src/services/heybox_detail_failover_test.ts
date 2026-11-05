/** @file 验证 Oracle 优先、Deno 备用的额度、去重、独立冷却和恢复切回行为。 */
import { assertEquals } from "../test_helpers.ts";
import type { TopicPost } from "../models.ts";
import type { TopicSource } from "./topic_source.ts";
import { withDetailFailover } from "./heybox_detail_failover.ts";

/** 用于验证摘要保留的公开帖子样例。 */
const post: TopicPost = {
  id: "sample",
  title: "怎么通过",
  body: "列表摘要",
  excerpt: "摘要",
  comments: [],
  commentReplies: [],
  publishedAt: "2026-11-05",
  url: "https://www.xiaoheihe.cn/app/bbs/link/sample",
};

/**
 * 构造可独立控制的出口与时钟。
 * @param {number} limit 两路共享的每分钟请求预算。
 * @return {object} 出口、调用记录与故障控制。
 */
function fixture(limit = 3) {
  let time = 1000;
  const calls: string[] = [];
  const state = {
    oracle: "success",
    deno: "success",
    oracleBlocked: 0,
    denoBlocked: 0,
  };
  /**
   * 模拟有独立故障状态的实际详情来源。
   * @param {"oracle" | "deno"} name 出口名称。
   * @return {TopicSource} 可控来源。
   */
  function source(name: "oracle" | "deno"): TopicSource {
    const blocked = name === "oracle" ? "oracleBlocked" : "denoBlocked";
    return {
      listLatestPosts: () => {
        calls.push(`${name}:list`);
        return Promise.resolve([post]);
      },
      detailRetryAfter: () => Math.max(0, (state[blocked] - time) / 1000),
      getPostDetails: (value) => {
        calls.push(`${name}:${value.id}`);
        if (state[name] === "throw") {
          return Promise.reject(new Error("network"));
        }
        if (state[name] === "captcha") {
          state[blocked] = time + 900000;
          return Promise.resolve({ ...value, detailsComplete: false });
        }
        if (state[name] === "deleted") {
          return Promise.resolve({
            ...value,
            detailsComplete: false,
            detailUnavailable: "deleted",
          });
        }
        return Promise.resolve({
          ...value,
          body: `${name}正文`,
          detailsComplete: true,
        });
      },
    };
  }
  const primary = source("oracle");
  const backup = source("deno");
  const client = withDetailFailover(primary, backup, {
    now: () => time,
    requestsPerMinute: limit,
  });
  return {
    client,
    state,
    calls,
    /** 推进时钟。@param {number} ms 毫秒数。 */
    advance: (ms: number) => {
      time += ms;
    },
  };
}

Deno.test("healthy Oracle handles lists and details without spending Deno requests", async () => {
  const f = fixture();
  await f.client.listLatestPosts("topic", { limit: 10, sort: "publishTime" });
  const result = await f.client.getPostDetails!(post);
  assertEquals(result.body, "oracle正文");
  assertEquals(result.title, post.title);
  assertEquals(result.url, post.url);
  await f.client.getPostDetails!(post);
  assertEquals(f.calls, ["oracle:list", "oracle:sample"]);
});

Deno.test("Oracle restriction selects Deno and Oracle resumes priority after cooldown", async () => {
  const f = fixture();
  f.state.oracle = "captcha";
  assertEquals((await f.client.getPostDetails!(post)).body, "deno正文");
  assertEquals(
    (await f.client.getPostDetails!({ ...post, id: "next" })).body,
    "deno正文",
  );
  assertEquals(f.calls, ["oracle:sample", "deno:sample", "deno:next"]);
  assertEquals(f.client.detailRetryAfter!(), 0);
  f.advance(900000);
  f.state.oracle = "success";
  assertEquals(
    (await f.client.getPostDetails!({ ...post, id: "recovered" })).body,
    "oracle正文",
  );
  assertEquals(f.calls.at(-1), "oracle:recovered");
  assertEquals(f.calls.filter((call) => call.startsWith("deno:")).length, 2);
});

Deno.test("both restricted routes remain failed without ping-pong or budget deferral", async () => {
  const f = fixture();
  f.state.oracle = f.state.deno = "captcha";
  for (let index = 0; index < 5; index++) {
    const result = await f.client.getPostDetails!({ ...post, id: `p${index}` });
    assertEquals(result.detailsComplete, false);
    assertEquals(result.body, post.body);
    assertEquals(result.detailDeferredUntil, undefined);
    assertEquals(result.detailUnavailable, undefined);
    f.advance(60000);
  }
  assertEquals(f.calls, ["oracle:p0", "deno:p0"]);
  assertEquals(f.client.detailRetryAfter!(), 600);
});

Deno.test("network and captcha cooldowns are independent and only due routes are probed", async () => {
  const f = fixture();
  f.state.oracle = "throw";
  f.state.deno = "captcha";
  await f.client.getPostDetails!(post);
  f.advance(60000);
  await f.client.getPostDetails!({ ...post, id: "probe" });
  assertEquals(f.calls, ["oracle:sample", "deno:sample", "oracle:probe"]);
  f.state.oracle = "success";
  f.advance(120000);
  const result = await f.client.getPostDetails!({ ...post, id: "restored" });
  assertEquals(result.body, "oracle正文");
  assertEquals(f.calls.filter((call) => call.startsWith("deno:")).length, 1);
});

Deno.test("fallback consumes the same request budget and resumes without stale deferral", async () => {
  const f = fixture(1);
  f.state.oracle = "captcha";
  const waiting = await f.client.getPostDetails!(post);
  assertEquals(waiting.detailDeferredUntil, 61000);
  assertEquals(f.calls, ["oracle:sample"]);
  f.advance(60000);
  const resumed = await f.client.getPostDetails!(waiting);
  assertEquals(resumed.body, "deno正文");
  assertEquals(resumed.detailDeferredUntil, undefined);
  assertEquals(f.calls, ["oracle:sample", "deno:sample"]);
});

Deno.test("concurrent posts share a single recovery probe and rolling budget", async () => {
  const f = fixture();
  f.state.oracle = "captcha";
  const results = await Promise.all(
    ["a", "b", "c", "d"].map((id) => f.client.getPostDetails!({ ...post, id })),
  );
  assertEquals(f.calls, ["oracle:a", "deno:a", "deno:b"]);
  assertEquals(results.map((r) => r.detailsComplete), [
    true,
    true,
    false,
    false,
  ]);
  assertEquals(results[2].detailDeferredUntil, 61000);
});

Deno.test("identical concurrent posts reuse fallback and copied cache results", async () => {
  const f = fixture();
  f.state.oracle = "captcha";
  const results = await Promise.all([
    f.client.getPostDetails!(post),
    f.client.getPostDetails!(post),
  ]);
  results[0].comments.push("local");
  assertEquals(results[1].comments, []);
  assertEquals(f.calls, ["oracle:sample", "deno:sample"]);
});

Deno.test("confirmed deletion is terminal and does not spend the backup quota", async () => {
  const f = fixture();
  f.state.oracle = "deleted";
  const result = await f.client.getPostDetails!(post);
  assertEquals(result.detailUnavailable, "deleted");
  assertEquals(result.body, post.body);
  await f.client.getPostDetails!(post);
  assertEquals(f.calls, ["oracle:sample"]);
  assertEquals(f.client.detailRetryAfter!(), 0);
});
