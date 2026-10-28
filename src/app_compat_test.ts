/** @file 验证旧 WebView API 的超时取消、安全随机源和原生实现保留。 */
import { runInNewContext } from "node:vm";
import { assert, assertEquals } from "@std/assert";

Deno.test("legacy timeout cancels a signal and UUID uses secure random bytes", async () => {
  const timers: { callback: () => void; delay: number }[] = [];
  let randomCalls = 0;
  const api = runInNewContext(
    await Deno.readTextFile(new URL("../static/app-compat.js", import.meta.url)) + "\n({timeout:AbortSignal.timeout,uuid:crypto.randomUUID})",
    {
      AbortSignal: {}, AbortController,
      setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); },
      crypto: { getRandomValues(bytes: Uint8Array) {
        randomCalls++;
        return crypto.getRandomValues(bytes);
      } },
    },
  );
  const signal = api.timeout(123);
  assertEquals(signal.aborted, false);
  assertEquals(timers[0].delay, 123);
  timers[0].callback();
  assertEquals(signal.aborted, true);
  const identifiers = Array.from({ length: 100 }, () => api.uuid());
  assertEquals(randomCalls, 100);
  assertEquals(new Set(identifiers).size, 100);
  assert(identifiers.every((id) => /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(id)));
});

Deno.test("modern engines retain their native timeout and UUID implementations", async () => {
  const scope = { AbortSignal: { timeout: AbortSignal.timeout }, crypto: { randomUUID: crypto.randomUUID } };
  runInNewContext(await Deno.readTextFile(new URL("../static/app-compat.js", import.meta.url)), scope);
  assertEquals(scope.AbortSignal.timeout, AbortSignal.timeout);
  assertEquals(scope.crypto.randomUUID, crypto.randomUUID);
});
