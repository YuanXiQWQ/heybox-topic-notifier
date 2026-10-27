/** @file 验证通知通道故障隔离与成功受理状态。 */
import { assertEquals, assertRejects } from "@std/assert";
import { sendIndependentNotifications } from "./application_notifier.ts";

Deno.test("notification channels retain successful delivery when the other channel fails", async () => {
  const failures: string[] = [];
  const result = await sendIndependentNotifications(
    "webhook",
    () => {
      throw new Error("test");
    },
    () => Promise.resolve(true),
    (channel) => failures.push(channel),
  );
  assertEquals(result, { provider: "webhook", sent: true });
  assertEquals(failures, ["其它"]);
  const other = await sendIndependentNotifications(
    "email",
    () => Promise.resolve({ provider: "email", sent: true }),
    () => {
      throw new Error("test");
    },
    (channel) => failures.push(channel),
  );
  assertEquals(other, { provider: "email", sent: true });
  assertEquals(failures, ["其它", "应用"]);
  await assertRejects(
    () =>
      sendIndependentNotifications(
        "webhook",
        () => Promise.reject(new Error("unavailable")),
        () => Promise.resolve(false),
        () => {},
      ),
    Error,
    "unavailable",
  );
});
