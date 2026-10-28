/** @file 验证测试通知的独立投递、错误保留和完整等待。 */
import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { sendNotificationTest } from "./notification_test.ts";

Deno.test("notification test attempts every channel and waits even when one throws synchronously", async () => {
  const failure = new Error("upstream failure");
  const calls: string[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const result = sendNotificationTest([
    () => { calls.push("webhook"); throw failure; },
    async () => { calls.push("native"); await waiting; calls.push("saved"); },
    () => { calls.push("browser"); return Promise.resolve(); },
  ]);
  let settled = false;
  const outcome = result.catch((error) => { settled = true; return error; });
  await Promise.resolve();
  assertEquals(calls, ["webhook", "native", "browser"]);
  assertEquals(settled, false);
  release();
  assertStrictEquals(await outcome, failure);
  assertEquals(calls.at(-1), "saved");
});

Deno.test("application failure cannot skip the other test notification", async () => {
  let sent = false;
  await assertRejects(() => sendNotificationTest([
    () => Promise.reject(new Error("application delivery")),
    () => { sent = true; return Promise.resolve(); },
  ]), Error, "application delivery");
  assertEquals(sent, true);
});
