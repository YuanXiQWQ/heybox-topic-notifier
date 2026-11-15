/** @file 验证服务器 SDK 在重启、令牌拒绝和限流后的身份及冷却行为。 */
import { assertEquals, assertRejects } from "@std/assert";
import type { TopicPost } from "../models.ts";
import { createHostedSdkDetails } from "./heybox_sdk_details.ts";
import {
  createSdkIdentity,
  type SdkIdentityStore,
} from "./heybox_sdk_identity.ts";
import { createSdkRefresher } from "./heybox_sdk_registration.ts";

/** 合成帖子，不包含真实账号或匿名凭据。 */
const post: TopicPost = {
  id: "123",
  title: "列表",
  body: "摘要",
  excerpt: "摘要",
  publishedAt: "",
  url: "",
  comments: [],
  commentReplies: [],
};

/**
 * 创建共享持久状态的离线依赖，重新创建来源仍使用相同身份和检查点。
 * @return {object} 可控制时间、响应和刷新计数的依赖。
 */
function fixture() {
  let time = 1800000000000, calls = 0, refreshes = 0, status = "ok";
  let state = {
    ...createSdkIdentity(time),
    registeredId: "a".repeat(88),
    registeredAt: time - 86400000,
    refreshRequired: false,
  };
  const original = structuredClone(state);
  const identity: SdkIdentityStore = {
    read: () => structuredClone(state),
    save: (next) => {
      state = structuredClone(next);
      return Promise.resolve();
    },
    close: () => {},
  };
  const checkpoint = {
    retryAt: 0,
    persist: (value: number) => {
      checkpoint.retryAt = value;
      return Promise.resolve();
    },
  };
  const cookies: string[] = [];
  const options = {
    identity,
    checkpoint,
    now: () => time,
    refresh: async () => {
      refreshes++;
      await identity.save({
        ...state,
        registeredId: "b".repeat(88),
        registeredAt: time,
        refreshRequired: false,
        retryAt: 0,
      });
    },
    fetchFn: ((_url, init) => {
      calls++;
      cookies.push(new Headers(init?.headers).get("cookie") ?? "");
      return Promise.resolve(
        Response.json({
          status,
          result: {
            link: { linkid: 123, title: "完整标题", text: "完整正文" },
          },
        }),
      );
    }) as typeof fetch,
  };
  return {
    options,
    original,
    cookies,
    counts: () => ({ calls, refreshes }),
    advance: (ms: number) => time += ms,
    status: (value: string) => status = value,
  };
}

Deno.test("hosted SDK restores an old cached token without arbitrary expiry or new identity", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const source = createHostedSdkDetails(f.options);
    assertEquals((await source.getPostDetails(post)).body, "完整正文");
    f.advance(86400000);
  }
  assertEquals(f.counts(), { calls: 2, refreshes: 0 });
  assertEquals(f.options.identity.read(), f.original);
});

Deno.test("token refusal persists across restart and renews the same identity after cooldown", async () => {
  const f = fixture();
  f.status("lack_token");
  assertEquals(
    (await createHostedSdkDetails(f.options).getPostDetails(post))
      .detailsComplete,
    false,
  );
  assertEquals(f.options.identity.read().refreshRequired, true);
  const restarted = createHostedSdkDetails(f.options);
  assertEquals(restarted.detailRetryAfter(), 60);
  await restarted.getPostDetails(post);
  assertEquals(f.counts(), { calls: 1, refreshes: 0 });
  f.advance(60000);
  f.status("ok");
  assertEquals((await restarted.getPostDetails(post)).detailsComplete, true);
  assertEquals(f.counts(), { calls: 2, refreshes: 1 });
  assertEquals(f.options.identity.read().bindingId, f.original.bindingId);
  assertEquals(f.options.identity.read().sessionId, f.original.sessionId);
  assertEquals(f.cookies, [
    "x_xhh_tokenid=B" + "a".repeat(88),
    "x_xhh_tokenid=B" + "b".repeat(88),
  ]);
});

Deno.test("CAPTCHA persists its full cooldown across restart without SDK refresh", async () => {
  const f = fixture();
  f.status("show_captcha");
  await createHostedSdkDetails(f.options).getPostDetails(post);
  const source = createHostedSdkDetails(f.options);
  assertEquals(source.detailRetryAfter(), 900);
  f.advance(899999);
  await source.getPostDetails(post);
  assertEquals(f.counts(), { calls: 1, refreshes: 0 });
  f.advance(1);
  f.status("ok");
  assertEquals((await source.getPostDetails(post)).detailsComplete, true);
  assertEquals(f.options.identity.read(), f.original);
});

Deno.test("checkpoint write failure prevents upstream requests and remains closed", async () => {
  const f = fixture();
  let writes = 0;
  const source = createHostedSdkDetails({
    ...f.options,
    checkpoint: {
      retryAt: 0,
      persist: () => {
        writes++;
        return Promise.reject(new Error("disk full"));
      },
    },
  });
  await source.getPostDetails(post);
  f.advance(86400000);
  await source.getPostDetails(post);
  assertEquals(f.counts(), { calls: 0, refreshes: 0 });
  assertEquals(writes, 1);
  assertEquals(source.detailRetryAfter(), 900);
});

Deno.test("interrupted detail request checkpoint blocks a new process", async () => {
  const f = fixture();
  await f.options.checkpoint.persist(f.options.now() + 930000);
  const source = createHostedSdkDetails(f.options);
  await source.getPostDetails(post);
  assertEquals(source.detailRetryAfter(), 930);
  assertEquals(f.counts(), { calls: 0, refreshes: 0 });
});

Deno.test("queued requests share the first restriction instead of sending concurrently", async () => {
  const f = fixture();
  f.status("show_captcha");
  const source = createHostedSdkDetails(f.options);
  await Promise.all(
    Array.from({ length: 10 }, () => source.getPostDetails(post)),
  );
  assertEquals(f.counts(), { calls: 1, refreshes: 0 });
});

Deno.test("failed registration retains old identity and persists cooldown before network access", async () => {
  const f = fixture();
  let requests = 0, collections = 0;
  const refresh = createSdkRefresher({
    identity: f.options.identity,
    now: f.options.now,
    collect: () => {
      collections++;
      return Promise.reject(new Error());
    },
    fetchFn: (() => {
      requests++;
      assertEquals(f.options.identity.read().retryAt, f.options.now() + 900000);
      return Promise.resolve(
        Response.json({ code: 1902, detail: { deviceId: "c".repeat(88) } }),
      );
    }) as typeof fetch,
  });
  const outcomes = await Promise.allSettled([refresh(), refresh()]);
  assertEquals(outcomes.map((x) => x.status), ["rejected", "rejected"]);
  assertEquals(requests, 1);
  assertEquals(collections, 0);
  assertEquals(f.options.identity.read(), {
    ...f.original,
    refreshRequired: true,
    retryAt: f.options.now() + 900000,
  });
  await assertRejects(refresh);
  assertEquals(requests, 1);
  const source = createHostedSdkDetails({ ...f.options, refresh });
  await source.getPostDetails(post);
  assertEquals(f.counts().calls, 0);
});
