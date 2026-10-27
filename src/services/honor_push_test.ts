/** @file 验证荣耀推送不携带私有正文、拒绝失败响应并清理失效会话。 */
import { assert, assertEquals, assertRejects } from "@std/assert";
import { deliverHonorPush, notifyHonorDevices } from "./honor_push.ts";
import type { Storage } from "../storage/types.ts";

/** 仅供内存传输使用的虚构应用配置。 */
const config = {
  appId: "12345",
  clientId: "test-client",
  clientSecret: "test-secret",
};
/** 虚构账号设备，不对应真实厂商 token。 */
const device = {
  id: "device",
  userId: "account",
  sessionHash: "session-secret",
  token: "fixture-device-token",
  provider: "honor" as const,
  updatedAt: new Date().toISOString(),
};
/** 私有正文只允许通过本站已认证收件箱读取。 */
const event = {
  id: "event",
  cursor: "1",
  createdAt: Date.now(),
  title: "private-title",
  body: "private-body",
  path: "/history",
};

Deno.test("Honor wakeup excludes private content, caches credentials and recognizes expired tokens", async () => {
  let requests = 0, expired = false;
  /** @param {RequestInfo | URL} input 固定官方地址。 @param {RequestInit} init 请求参数。 @return {Promise<Response>} 虚构官方响应。 */
  const transport: typeof fetch = (input, init) => {
    requests++;
    assertEquals(init?.redirect, "error");
    if (String(input).includes("iam.developer")) {
      assertEquals(String(input), "https://iam.developer.honor.com/auth/token");
      return Promise.resolve(
        Response.json({ access_token: "access-fixture", expires_in: 3600 }),
      );
    }
    assertEquals(
      String(input),
      "https://push-api.cloud.honor.com/api/v1/12345/sendMessage",
    );
    const body = JSON.parse(String(init?.body));
    assertEquals(JSON.parse(body.data), { type: "matches", eventId: event.id });
    for (
      const secret of [
        event.body,
        event.title,
        device.sessionHash,
        config.clientSecret,
      ]
    ) assert(!String(init?.body).includes(secret));
    return Promise.resolve(
      Response.json({
        code: 200,
        data: {
          sendResult: true,
          failTokens: [],
          expireTokens: expired ? [device.token] : [],
        },
      }),
    );
  };
  assertEquals(
    await deliverHonorPush(device, event, config, transport),
    "sent",
  );
  expired = true;
  assertEquals(
    await deliverHonorPush(device, event, config, transport),
    "expired",
  );
  assertEquals(requests, 3);
  await assertRejects(
    () =>
      deliverHonorPush(device, event, config, () =>
        Promise.resolve(
          Response.json({ code: 200, data: { sendResult: false } }),
        )),
    Error,
    "rejected",
  );
});

Deno.test("Honor delivery removes expired account bindings without contacting the vendor", async () => {
  const removed: unknown[] = [];
  const storage = {
    nativePush: {
      list: () => Promise.resolve([device]),
      remove: (...args: unknown[]) => {
        removed.push(args);
        return Promise.resolve();
      },
    },
    getSession: () => Promise.resolve(null),
  } as unknown as Storage;
  assertEquals(
    await notifyHonorDevices(storage, device.userId, event, {
      config,
      deliver: () => {
        throw new Error("Vendor must not be contacted");
      },
    }),
    false,
  );
  assertEquals(removed, [[device.id, device.userId, device.sessionHash]]);
});
