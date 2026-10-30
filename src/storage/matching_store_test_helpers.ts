/** @file 为 KV 与 Turso 判定缓存提供相同的持久化、隔离及淘汰契约检查。 */
import { assert, assertEquals } from "../test_helpers.ts";
import type { MatchingEntry, MatchingStore } from "./matching_types.ts";
import { matchingRuntimeForDay } from "../services/matching_engine.ts";

/**
 * 验证两个独立用户缓存的持久化租约、过期及数量边界。
 * @param {MatchingStore} store 主用户缓存。
 * @param {MatchingStore} other 另一用户缓存。
 */
export async function verifyMatchingStore(
  store: MatchingStore,
  other: MatchingStore,
): Promise<void> {
  const now = Date.now();
  assert(await store.acquire("one", now));
  assertEquals(await store.acquire("two", now), false);
  assert(await other.acquire("two", now));
  await store.release("two");
  assertEquals(await store.acquire("two", now), false);
  assert(await store.acquire("two", now + 120001));
  assertEquals(await store.renew("one", now + 120001), false);
  assertEquals(await store.renew("two", now + 240002), false);
  await store.release("one");
  assertEquals(await store.acquire("three", now + 120002), false);
  await store.release("two");
  const base: MatchingEntry = {
    key: "keep",
    topicId: "topic",
    postId: "post",
    fingerprint: "hash",
    config: "config",
    lastSeenAt: now,
    expiresAt: now + 86400000,
    result: null,
    attempts: 0,
    retryAt: 0,
  };
  await store.put(base);
  assertEquals(await other.get("keep"), undefined);
  await store.put({ ...base, key: "expired", expiresAt: now - 1 });
  const queued = {
    id: "post",
    title: "待处理",
    body: "",
    excerpt: "",
    comments: [],
    commentReplies: [],
    url: "https://example.com",
    publishedAt: "2026-10-01",
  };
  for (let i = 0; i < 205; i++) {
    await store.put({
      ...base,
      key: `pending-${i}`,
      result: undefined,
      pendingPost: queued,
      lastSeenAt: now - i,
    });
  }
  assertEquals((await store.pending("topic", now)).length, 20);
  assertEquals((await other.pending("topic", now)).length, 0);
  const count = await store.prune(now, 1000);
  assertEquals(count, { count: 201, pending: 200, dropped: 5 });
  assertEquals(await store.get("expired"), undefined);
  const limited = await store.prune(now, 10);
  assertEquals(limited.count, 10);
  assertEquals((await store.get("keep"))?.result, null);
  const runtime = matchingRuntimeForDay(undefined, now);
  runtime.aiFailure = { id: "outage", notified: true };
  await store.saveRuntime(runtime);
  assertEquals((await store.runtime())?.aiFailure, runtime.aiFailure);
  assertEquals((await other.runtime())?.aiFailure, undefined);
  await store.put({ ...base, key: "frozen", topicId: "frozen-topic", result: undefined, pendingPost: queued, attempts: 3, retryAt: base.expiresAt });
  assertEquals((await store.pending("frozen-topic", now)).map((entry) => entry.key), ["frozen"]);
  assertEquals(await store.pending("frozen-topic", base.expiresAt), []);
}
