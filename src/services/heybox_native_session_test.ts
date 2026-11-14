/** @file 验证原生匿名会话的身份绑定、自动读取、完整正文和跨刷新冷却。 */
import { assertEquals, assertThrows } from "@std/assert";
import type { TopicPost } from "../models.ts";
import {
  createNativeSessionDetails,
  type HeyboxNativeSession,
  requireNativeSession,
} from "./heybox_native_session.ts";

/** 合成测试身份，不代表真实 SDK 注册结果。 */
const deviceId = "0123456789abcdef";
/** 合成公开帖；测试不能以摘要充当完整正文。 */
const post: TopicPost = {
  id: "123",
  title: "列表",
  body: "摘要",
  excerpt: "摘要",
  comments: [],
  commentReplies: [],
  publishedAt: "",
  url: "",
};

/**
 * 生成仅供离线测试的 SDK 快照。
 * @param {number} observedAt 观察时间。
 * @return {HeyboxNativeSession} 合成会话。
 */
function fixture(observedAt: number): HeyboxNativeSession {
  return {
    deviceId,
    token: "B" + "a".repeat(88),
    model: "test",
    osVersion: "15",
    dw: "393",
    appBuild: "1149",
    appVersion: "1.3.400",
    channel: "heybox",
    observedAt,
  };
}

/**
 * 返回完整正文和独立评论的合成响应。
 * @return {Response} 可供现有解析器校验的响应。
 */
function detail(): Response {
  return Response.json({
    status: "ok",
    result: { link: { linkid: 123, title: "详情", text: "完整正文" } },
  });
}

Deno.test("native sessions use fresh SDK snapshots with one persistent identity", async () => {
  let time = 1000;
  let token = "B" + "a".repeat(88);
  let reads = 0;
  const cookies: string[] = [];
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => time,
    readSession: () => {
      reads++;
      return Promise.resolve({ ...fixture(time), token });
    },
    fetchFn: (input, init) => {
      const url = new URL(String(input));
      assertEquals(
        url.origin + url.pathname,
        "https://api.xiaoheihe.cn/bbs/app/link/tree",
      );
      assertEquals(url.searchParams.get("imei"), deviceId);
      assertEquals(url.searchParams.get("heybox_id"), "-1");
      assertEquals(url.searchParams.get("channel"), "heybox");
      assertEquals(url.searchParams.get("_rnd")?.startsWith("14:"), true);
      assertEquals(init?.redirect, "error");
      cookies.push(new Headers(init?.headers).get("cookie")!);
      return Promise.resolve(detail());
    },
  });
  assertEquals((await source.getPostDetails(post)).body, "完整正文");
  time += 1000;
  token = "B" + "b".repeat(88);
  assertEquals((await source.getPostDetails(post)).detailsComplete, true);
  assertEquals(reads, 2);
  assertEquals(cookies, [
    "x_xhh_tokenid=B" + "a".repeat(88),
    "x_xhh_tokenid=" + token,
  ]);
});

Deno.test("native session refresh and queued posts cannot bypass captcha cooldown", async () => {
  let time = 1000;
  let reads = 0;
  let requests = 0;
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => time,
    readSession: () => {
      reads++;
      return Promise.resolve(fixture(time));
    },
    fetchFn: () => {
      requests++;
      return Promise.resolve(
        requests === 1 ? Response.json({ status: "show_captcha" }) : detail(),
      );
    },
  });
  const results = await Promise.all([
    source.getPostDetails(post),
    source.getPostDetails(post),
  ]);
  assertEquals(results.map((p) => p.detailsComplete), [false, false]);
  assertEquals(source.detailRetryAfter(), 900);
  assertEquals([reads, requests], [1, 1]);
  time += 899999;
  assertEquals((await source.getPostDetails(post)).detailsComplete, false);
  assertEquals([reads, requests], [1, 1]);
  time++;
  assertEquals((await source.getPostDetails(post)).detailsComplete, true);
  assertEquals([reads, requests], [2, 2]);
});

Deno.test("native sessions reject changed devices and stale or offline SDK observations", async () => {
  const original = fixture(1000);
  for (
    const change of [
      { deviceId: "fedcba9876543210" },
      { token: "D" + "a".repeat(88) },
      { observedAt: -599000 },
      { observedAt: 31001 },
      { observedAt: NaN },
      { token: original.token + "; other=cookie" },
      { appBuild: "783" },
    ]
  ) {
    assertThrows(() =>
      requireNativeSession({ ...original, ...change }, deviceId, 1000)
    );
  }
  let calls = 0;
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => 1000,
    readSession: () =>
      Promise.resolve({ ...original, deviceId: "fedcba9876543210" }),
    fetchFn: () => {
      calls++;
      return Promise.resolve(detail());
    },
  });
  const result = await source.getPostDetails({
    ...post,
    detailsComplete: true,
    detailUnavailable: "deleted",
  });
  assertEquals(result.detailsComplete, false);
  assertEquals(result.detailUnavailable, undefined);
  assertEquals(result.body, "摘要");
  assertEquals(calls, 0);
  assertEquals(source.detailRetryAfter(), 60);
});

Deno.test("native initialization errors do not expose their contents or erase backoff", async () => {
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => 1000,
    readSession: () =>
      Promise.reject(new Error("synthetic-private-credential")),
  });
  assertEquals((await source.getPostDetails(post)).detailsComplete, false);
  assertEquals(source.detailRetryAfter(), 60);
  assertThrows(() =>
    createNativeSessionDetails({
      expectedDeviceId: "",
      readSession: () => Promise.resolve(null),
    })
  );
});

Deno.test("stalled native devices are aborted and queued requests stop during backoff", async () => {
  let reads = 0;
  let aborted = false;
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => 1000,
    sessionReadTimeoutMs: 10,
    readSession: (signal) => {
      reads++;
      signal.addEventListener("abort", () => aborted = true, { once: true });
      return new Promise(() => {});
    },
  });
  const results = await Promise.all(
    Array.from({ length: 9 }, () => source.getPostDetails(post)),
  );
  assertEquals(results.every((p) => p.detailsComplete === false), true);
  assertEquals(reads, 1);
  assertEquals(aborted, true);
  assertEquals(source.detailRetryAfter(), 60);
});

Deno.test("native retry checkpoint preserves captcha cooldown across service restarts", async () => {
  let time = 1000;
  let stored = 0;
  let requests = 0;
  const options = {
    expectedDeviceId: deviceId,
    now: () => time,
    readSession: () => Promise.resolve(fixture(time)),
    persistRetryAt: (value: number) => {
      stored = value;
      return Promise.resolve();
    },
    fetchFn: () => {
      requests++;
      return Promise.resolve(Response.json({ status: "show_captcha" }));
    },
  };
  const first = createNativeSessionDetails(options);
  await first.getPostDetails(post);
  assertEquals(stored, 901000);
  time += 30000;
  const recovered = createNativeSessionDetails({
    ...options,
    initialRetryAt: stored,
  });
  assertEquals((await recovered.getPostDetails(post)).detailsComplete, false);
  assertEquals(requests, 1);
  assertEquals(recovered.detailRetryAfter(), 870);
  time = 901000;
  await recovered.getPostDetails(post);
  assertEquals(requests, 2);
});

Deno.test("native requests reserve durable backoff before touching the network", async () => {
  let stored = 0;
  let release: (response: Response) => void = () => {};
  let networkStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => networkStarted = resolve);
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => 1000,
    readSession: () => Promise.resolve(fixture(1000)),
    persistRetryAt: (value) => {
      stored = value;
      return Promise.resolve();
    },
    fetchFn: () => {
      networkStarted();
      return new Promise<Response>((resolve) => release = resolve);
    },
  });
  const pending = source.getPostDetails(post);
  await started;
  assertEquals(stored, 931000);
  let restartedRequests = 0;
  const interrupted = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    initialRetryAt: stored,
    now: () => 2000,
    readSession: () => Promise.resolve(fixture(2000)),
    fetchFn: () => {
      restartedRequests++;
      return Promise.resolve(detail());
    },
  });
  await interrupted.getPostDetails(post);
  assertEquals(restartedRequests, 0);
  release(detail());
  assertEquals((await pending).detailsComplete, true);
  assertEquals(stored, 1000);
});

for (const failureAt of [1, 2]) {
  Deno.test(`native retry write failure ${failureAt} keeps subsequent traffic stopped`, async () => {
    let time = 1000;
    let writes = 0;
    let requests = 0;
    let statuses = 0;
    const source = createNativeSessionDetails({
      expectedDeviceId: deviceId,
      now: () => time,
      readSession: () => Promise.resolve(fixture(time)),
      persistRetryAt: () => {
        if (++writes === failureAt) {
          return Promise.reject(new Error("synthetic-private-path"));
        }
        return Promise.resolve();
      },
      fetchFn: () => {
        requests++;
        return Promise.resolve(detail());
      },
      onSessionStatus: () => statuses++,
    });
    assertEquals((await source.getPostDetails(post)).detailsComplete, false);
    assertEquals(requests, failureAt - 1);
    assertEquals(statuses, 0);
    time += 2000000;
    assertEquals((await source.getPostDetails(post)).detailsComplete, false);
    assertEquals(requests, failureAt - 1);
  });
}

Deno.test("native SDK recovery signals follow durable lack_token backoff, never captcha or hkey", async () => {
  for (const status of ["lack_token", "show_captcha", "hkey"]) {
    let stored = 0;
    const signals: unknown[] = [];
    const source = createNativeSessionDetails({
      expectedDeviceId: deviceId,
      now: () => 1000,
      readSession: () => Promise.resolve(fixture(1000)),
      fetchFn: () => Promise.resolve(Response.json({ status })),
      persistRetryAt: (value) => {
        stored = value;
        return Promise.resolve();
      },
      onSessionStatus: (value, retryAt, observedAt) => {
        assertEquals(stored, retryAt);
        signals.push([value, retryAt, observedAt]);
      },
    });
    await source.getPostDetails(post);
    assertEquals(
      signals,
      status === "lack_token" ? [["rejected", 61000, 1000]] : [],
    );
  }
});

Deno.test("native SDK acceptance reports the snapshot actually used by the request", async () => {
  let snapshot = fixture(1000);
  const signals: unknown[] = [];
  const source = createNativeSessionDetails({
    expectedDeviceId: deviceId,
    now: () => 2000,
    readSession: () => Promise.resolve(snapshot),
    fetchFn: () => {
      snapshot = fixture(2000);
      return Promise.resolve(detail());
    },
    onSessionStatus: (status, retryAt, observedAt) =>
      signals.push([status, retryAt, observedAt]),
  });
  await source.getPostDetails(post);
  assertEquals(signals, [["accepted", 2000, 1000]]);
});
