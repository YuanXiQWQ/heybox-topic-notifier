/** @file 共用浏览器订阅隔离、换绑和删除验证。 */
import type { WebPushDevice, WebPushStore } from "./web_push_types.ts";
import { assertEquals } from "../test_helpers.ts";

/**
 * 验证设备只能属于一个账号，过期账号的删除不能误删新账号绑定。
 * @param {WebPushStore} store 待验证的设备存储。
 */
export async function verifyWebPushStore(store: WebPushStore): Promise<void> {
  const device: WebPushDevice = {
    id: "test-device",
    userId: "alice",
    sessionHash: "alice-session",
    subscription: {
      endpoint: "https://fcm.googleapis.com/push/test",
      keys: { auth: "test-auth", p256dh: "test-key" },
    },
    updatedAt: "2026-10-27T00:00:00.000Z",
  };
  await store.save(device);
  await store.save(device);
  assertEquals(await store.list("alice"), [device]);
  assertEquals(await store.list("bob"), []);
  const rebound = { ...device, userId: "bob", sessionHash: "bob-session" };
  await store.save(rebound);
  await store.remove(device.id, "alice");
  assertEquals(await store.list("alice"), []);
  assertEquals(await store.list("bob"), [rebound]);
  const refreshed = { ...rebound, sessionHash: "new-session" };
  await store.save(refreshed);
  await store.remove(device.id, "bob", rebound.sessionHash);
  assertEquals(await store.list("bob"), [refreshed]);
  await store.remove(device.id, "bob");
  assertEquals(await store.list("bob"), []);
}
