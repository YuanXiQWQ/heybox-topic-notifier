/** @file 验证服务故障复用命中通知通道，并保持应用事件去重和业务计数独立。 */
import { assert, assertEquals } from "../test_helpers.ts";
import { createKvStorage } from "../storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { createNotifier } from "./notifier.ts";
import { createPollingNotifier } from "./polling_notifier.ts";
import { enqueueNativeNotifications } from "./native_notifications.ts";
import {
  aiFailureNotification,
  aiFallbackNotice,
} from "./service_notification.ts";
import type { MatchRecord } from "../models.ts";

Deno.test("service faults attempt all channels independently without creating business records", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const settings = {
      ...defaultAppSettingsFromEnv(),
      locale: "zh-CN" as const,
      notificationProvider: "webhook" as const,
    };
    const storage = createKvStorage(settings, {
      openKv: () => Promise.resolve(kv),
    });
    let other = 0, browser = 0;
    const notifier = createPollingNotifier(storage, {
      other: () => {
        other++;
        return Promise.reject(new Error("offline"));
      },
      browsers: (_storage, userId, content) => {
        browser++;
        assertEquals(userId, "alice");
        assert(!Array.isArray(content));
        return Promise.reject(new Error("offline"));
      },
    });
    const alice = storage.forUser("alice");
    const before = await alice.getAppState();
    const notice = aiFailureNotification("outage-one", settings);
    assertEquals(
      (await notifier.sendService(notice, settings, "alice")).sent,
      true,
    );
    assertEquals(
      (await notifier.sendService(notice, settings, "alice")).sent,
      true,
    );
    assertEquals(other, 2);
    assertEquals(browser, 2);
    const events = (await alice.nativeNotifications!.read("")).events;
    assertEquals(events.length, 1);
    assertEquals(events[0].body, notice.body);
    assertEquals(events[0].path, "/settings");
    assert(/^\d{16}:/.test(events[0].cursor));
    assertEquals(await alice.getAppState(), before);
    assertEquals(
      (await storage.forUser("bob").nativeNotifications!.read("")).events,
      [],
    );
    await notifier.sendService(
      aiFailureNotification("outage-next-day", settings),
      settings,
      "alice",
    );
    assertEquals((await alice.nativeNotifications!.read("")).events.length, 2);

    const fallback: MatchRecord = {
      id: "match",
      kind: "keyword",
      aiFallback: true,
      keyword: "help",
      location: "title",
      matchedAt: new Date().toISOString(),
      post: {
        id: "post",
        title: "help",
        body: "",
        excerpt: "",
        comments: [],
        commentReplies: [],
        url: "https://example.com/post",
        publishedAt: "",
      },
    };
    await enqueueNativeNotifications(storage, "alice", [fallback], settings);
    const next =
      (await alice.nativeNotifications!.read(events[0].cursor)).events;
    assert(
      next[1].body.startsWith(aiFallbackNotice([fallback], settings) + "\n"),
    );
    assertEquals(next[1].path, "/history");
  } finally {
    kv.close();
  }
});

Deno.test("other notification delivery succeeds even when every application channel fails", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const settings = {
      ...defaultAppSettingsFromEnv(),
      notificationProvider: "webhook" as const,
      notificationWebhookUrl: "https://example.com/notify",
    };
    const storage = createKvStorage(settings, {
      openKv: () => Promise.resolve(kv),
    });
    let native = 0, browser = 0, other = 0;
    const notifier = createPollingNotifier(storage, {
      other: () =>
        Promise.resolve(
          createNotifier({
            resolveDns: () => Promise.resolve(["93.184.216.34"]),
            deliveryLogger: () => {},
            fetch: () => {
              other++;
              return Promise.resolve(new Response(null, { status: 204 }));
            },
          }),
        ),
      browsers: () => {
        browser++;
        return Promise.reject(new Error("offline"));
      },
      native: () => {
        native++;
        return Promise.reject(new Error("offline"));
      },
    });
    assertEquals(
      (await notifier.sendService(
        aiFailureNotification("outage", settings),
        settings,
        "alice",
      )).sent,
      true,
    );
    assertEquals([other, browser, native], [1, 1, 1]);
  } finally {
    kv.close();
  }
});
