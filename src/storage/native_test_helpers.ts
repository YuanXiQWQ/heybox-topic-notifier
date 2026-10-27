/** @file 验证原生通知断线补取、幂等顺序及登录交接单次消费。 */
import { assert, assertEquals } from "@std/assert";
import type { Storage } from "./types.ts";

/**
 * 在数据库适配器上验证通知和登录交接原子性。
 * @param {Storage} storage 待验证的存储。
 */
export async function verifyNativeCapabilities(
  storage: Storage,
): Promise<void> {
  const push = storage.nativePush!;
  const device = {
    id: "honor-device",
    userId: "native-user",
    sessionHash: "session-one",
    token: "fixture-token",
    provider: "honor" as const,
    updatedAt: new Date().toISOString(),
  };
  await push.save(device);
  await push.save({
    ...device,
    userId: "other-user",
    sessionHash: "session-two",
  });
  await push.remove(device.id, device.userId, device.sessionHash);
  await push.remove(device.id, "other-user", "session-one");
  assertEquals(await push.list("native-user"), []);
  assertEquals((await push.list("other-user")).length, 1);
  await push.remove(device.id, "other-user", "session-two");
  assertEquals(await push.list("other-user"), []);
  const inbox = storage.forUser("native-user").nativeNotifications!;
  const base = {
    id: "a".repeat(43),
    cursor: "",
    createdAt: Date.now(),
    title: "title",
    body: "body",
    path: "/history",
  };
  assertEquals(await inbox.read(), { events: [], cursor: "" });
  const first = await inbox.save(base);
  const baseline = await inbox.read();
  assertEquals(baseline.events, []);
  assertEquals(baseline.cursor, first.cursor);
  await inbox.save({
    ...base,
    body: "duplicate must not change the notification",
  });
  const next = await inbox.save({
    ...base,
    id: "b".repeat(43),
    createdAt: base.createdAt - 1000,
  });
  assert(next.cursor > first.cursor);
  assertEquals((await inbox.read(first.cursor)).events, [next]);
  assertEquals((await inbox.read("")).events.length, 2);
  assertEquals(
    (await storage.forUser("other-user").nativeNotifications!.read("")).events,
    [],
  );
  const pending = {
    id: "native-login",
    challenge: "proof",
    expiresAt: Date.now() + 60000,
  };
  const login = storage.nativeLogin!;
  assertEquals(await login.create(pending), true);
  assertEquals(await login.create(pending), false);
  assertEquals(await login.consume(pending.id, pending.challenge), undefined);
  assertEquals(await login.approve(pending.id, "native-user"), true);
  assertEquals(await login.approve(pending.id, "other-user"), false);
  assertEquals(await login.consume(pending.id, "wrong"), undefined);
  const results = await Promise.all([
    login.consume(pending.id, pending.challenge),
    login.consume(pending.id, pending.challenge),
  ]);
  assertEquals(results.filter(Boolean), ["native-user"]);
}
