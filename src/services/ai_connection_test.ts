/** @file 验证连通测试的配置校验、额度计数和用户租约隔离。 */
import { assert, assertEquals } from "../test_helpers.ts";
import { createKvStorage } from "../storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { normalizeMatchingSettings } from "./matching_settings.ts";
import { testAiConnection } from "./ai_connection.ts";

Deno.test("AI connection tests use fixed input, account for usage, and respect daily limits and leases", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = createKvStorage(defaultAppSettingsFromEnv(), {
    openKv: () => Promise.resolve(kv),
  }).matching!;
  const settings = normalizeMatchingSettings({
    mode: "ai",
    provider: "deepseek",
    model: "deepseek-flash",
    apiKey: "fixture-key",
    dailyLimit: 1,
  });
  let calls = 0;
  const ai = {
    classify: (post: { id: string; title: string }) => {
      calls++;
      assertEquals(post.id, "connection-test");
      assertEquals(post.title, "连接测试");
      return Promise.resolve({
        decision: "insufficient" as const,
        inputTokens: 50,
        outputTokens: 12,
        usageKnown: true,
      });
    },
  };
  try {
    assertEquals(
      await testAiConnection({ ...settings, mode: "rules" }, store, ai),
      { ok: false, error: "configuration" },
    );
    assertEquals(
      await testAiConnection({ ...settings, apiKey: "" }, store, ai),
      { ok: false, error: "configuration" },
    );
    assert(await store.acquire("polling", Date.now()));
    assertEquals(await testAiConnection(settings, store, ai), {
      ok: false,
      error: "busy",
    });
    await store.release("polling");
    assertEquals(await testAiConnection(settings, store, ai), { ok: true });
    const runtime = await store.runtime();
    assertEquals(runtime?.calls, 1);
    assertEquals(runtime?.inputTokens, 50);
    assertEquals(runtime?.outputTokens, 12);
    assertEquals(runtime?.unknownUsage, 0);
    assertEquals(runtime?.cacheCount, 0);
    assertEquals(await testAiConnection(settings, store, ai), {
      ok: false,
      error: "limit",
    });
    assertEquals(calls, 1);
    assert(await store.acquire("after-test", Date.now()));
  } finally {
    kv.close();
  }
});

Deno.test("AI connection failures consume one attempt and always release the lease", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = createKvStorage(defaultAppSettingsFromEnv(), {
    openKv: () => Promise.resolve(kv),
  }).matching!;
  const settings = normalizeMatchingSettings({
    mode: "ai",
    provider: "deepseek",
    model: "deepseek-flash",
    apiKey: "fixture-key",
  });
  try {
    const result = await testAiConnection(settings, store, {
      classify: () =>
        Promise.resolve({
          error: "AI HTTP 401",
          inputTokens: 0,
          outputTokens: 0,
          usageKnown: false,
        }),
    });
    assertEquals(result, {
      ok: false,
      error: "request",
      detail: "AI HTTP 401",
    });
    assertEquals((await store.runtime())?.calls, 1);
    assertEquals((await store.runtime())?.unknownUsage, 1);
    assertEquals((await store.runtime())?.failures, 1);
    assert(await store.acquire("after-error", Date.now()));
  } finally {
    kv.close();
  }
});
