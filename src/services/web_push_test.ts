/** @file 验证浏览器推送加密、固定目标、会话隔离和失效设备清理。 */
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";
import { createECDH } from "node:crypto";
import { assert, assertEquals } from "../test_helpers.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { createKvStorage } from "../storage/kv.ts";
import {
  deliverWebPush,
  notifyBrowsers,
  parseBrowserSubscription,
} from "./web_push.ts";
import type { WebPushDevice } from "../storage/web_push_types.ts";
import type { MatchRecord } from "../models.ts";

/**
 * 生成仅供模拟推送验证的加密订阅，不请求外部推送服务。
 * @return {WebPushDevice} 测试设备。
 */
function device(): WebPushDevice {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    id: "device",
    userId: "alice",
    sessionHash: "session",
    updatedAt: new Date().toISOString(),
    subscription: {
      endpoint: "https://fcm.googleapis.com/push/test",
      keys: {
        auth: "AAAAAAAAAAAAAAAAAAAAAA",
        p256dh: ecdh.getPublicKey().toString("base64url"),
      },
    },
  };
}

Deno.test("web push rejects arbitrary endpoints and encrypts the payload", async () => {
  const testDevice = device();
  for (
    const endpoint of [
      "http://fcm.googleapis.com/push",
      "https://localhost/push",
      "https://fcm.googleapis.com.evil.com/push",
      "https://fcm.googleapis.com:8080/push",
    ]
  ) {
    assertEquals(
      parseBrowserSubscription({ ...testDevice.subscription, endpoint }),
      undefined,
    );
  }
  const config = {
    ...webPush.generateVAPIDKeys(),
    subject: "mailto:test@example.com",
  };
  const outcome = await deliverWebPush(
    testDevice,
    {
      userId: "alice",
      title: "test",
      body: "private-notification",
      tag: "tag",
      path: "/",
    },
    config,
    (_input, init) => {
      assertEquals(init?.redirect, "error");
      assertEquals(
        new Headers(init?.headers).get("content-encoding"),
        "aes128gcm",
      );
      assert(
        !new TextDecoder().decode(init?.body as Uint8Array).includes(
          "private-notification",
        ),
      );
      return Promise.resolve(new Response(null, { status: 201 }));
    },
  );
  assertEquals(outcome, "sent");
  assertEquals(
    await deliverWebPush(
      testDevice,
      { userId: "alice", title: "test", body: "", tag: "tag", path: "/" },
      config,
      () => Promise.resolve(new Response(null, { status: 410 })),
    ),
    "expired",
  );
});

Deno.test("browser delivery skips revoked sessions without depending on other notification settings", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const settings = defaultAppSettingsFromEnv();
    settings.notificationProvider = "disabled";
    const storage = createKvStorage(settings, {
      openKv: () => Promise.resolve(kv),
    });
    const current = device();
    await storage.webPush!.save(current);
    await storage.saveSession({
      tokenHash: "session",
      userId: "alice",
      username: "alice",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const record: MatchRecord = {
      id: "match",
      matchedAt: new Date().toISOString(),
      keyword: "help",
      location: "title",
      post: {
        id: "post",
        title: "help",
        body: "",
        excerpt: "",
        comments: [],
        commentReplies: [],
        url: "https://example.com",
        publishedAt: new Date().toISOString(),
      },
    };
    const config = {
      ...webPush.generateVAPIDKeys(),
      subject: "mailto:test@example.com",
    };
    let delivered = 0;
    const options = {
      config,
      deliver: () => {
        delivered++;
        return Promise.resolve("sent" as const);
      },
    };
    assertEquals(
      await notifyBrowsers(storage, "alice", [record], settings, options),
      true,
    );
    await storage.deleteSession("session");
    assertEquals(
      await notifyBrowsers(storage, "alice", [record], settings, options),
      false,
    );
    assertEquals(delivered, 1);
    assertEquals(await storage.webPush!.list("alice"), []);
  } finally {
    kv.close();
  }
});
