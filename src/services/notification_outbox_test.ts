/** @file 验证投递在进程重启后恢复、通道独立重试及同事务回滚。 */
import { assertEquals } from "../test_helpers.ts";
import type { MatchRecord } from "../models.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { deliverNotificationOutbox } from "./notification_outbox.ts";
import { createTursoStorage } from "../storage/turso.ts";
import { MemorySqlClient } from "../storage/sqlite_test_helpers.ts";
import { serverEditStamp } from "../sync/protocol.ts";

/** 测试只使用内存数据库，不配置真实通知通道。 */
const settings = defaultAppSettingsFromEnv();
/** 可序列化的新命中测试载荷。 */
const record: MatchRecord = {
  id: "match",
  keyword: "help",
  location: "title",
  matchedAt: "2026-11-03T00:00:00Z",
  post: {
    id: "post",
    title: "help",
    url: "https://example.test/post",
    publishedAt: "2026-11-03T00:00:00Z",
    body: "",
    excerpt: "",
    comments: [],
    commentReplies: [],
  },
};

Deno.test("outbox recovers after save/restart and only retries the failed channel", async () => {
  const client = new MemorySqlClient();
  try {
    const storage = createTursoStorage(settings, {
      client,
      notificationOutbox: true,
    });
    await storage.forUser("alice").saveMatch(record, { notify: true });
    const reopened = createTursoStorage(settings, {
      client,
      notificationOutbox: true,
    });
    const user = reopened.forUser("alice"), queue = user.notificationOutbox!;
    const calls = { other: 0, browser: 0, native: 0 };
    let fail = true, clock = 1000;
    const channels = {
      other: () => {
        calls.other++;
        return fail
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(true);
      },
      browser: () => {
        calls.browser++;
        return Promise.resolve(true);
      },
      native: () => {
        calls.native++;
        return Promise.resolve(true);
      },
    };
    assertEquals(
      await deliverNotificationOutbox(queue, channels, () => clock),
      { sent: true, failed: true },
    );
    assertEquals(calls, { other: 1, browser: 1, native: 1 });
    assertEquals(
      (await user.listHistory())[0].notifiedAt,
      new Date(clock).toISOString(),
    );
    clock += 4999;
    await deliverNotificationOutbox(queue, channels, () => clock);
    assertEquals(calls.other, 1);
    clock++;
    fail = false;
    await deliverNotificationOutbox(queue, channels, () => clock);
    assertEquals(calls, { other: 2, browser: 1, native: 1 });
    assertEquals(await queue.claim(clock + 600_000), []);
    assertEquals(
      await reopened.forUser("bob").notificationOutbox!.claim(clock),
      [],
    );
  } finally {
    client.close();
  }
});

Deno.test("outbox leases survive restart and stale senders cannot acknowledge newly claimed work", async () => {
  const client = new MemorySqlClient();
  try {
    const user = createTursoStorage(settings, {
      client,
      notificationOutbox: true,
    }).forUser("alice");
    await user.saveMatch(record, { notify: true });
    const old = await user.notificationOutbox!.claim(1000);
    assertEquals(old.length, 3);
    const next = createTursoStorage(settings, {
      client,
      notificationOutbox: true,
    }).forUser("alice").notificationOutbox!;
    assertEquals(await next.claim(2000), []);
    const renewed = await next.claim(301000);
    assertEquals(renewed.length, 3);
    await user.notificationOutbox!.complete(old, new Date().toISOString());
    const pending = await client.execute(
      "SELECT COUNT(*) AS total FROM notification_outbox",
    );
    assertEquals(Number(pending.rows[0].total), 3);
    assertEquals((await user.listHistory())[0].notifiedAt, undefined);
    await next.complete(renewed);
    assertEquals(await next.claim(1000000), []);
  } finally {
    client.close();
  }
});

Deno.test("outbox creation rolls back with the match, and edits/restores/imports do not generate duplicate tasks", async () => {
  const client = new MemorySqlClient();
  try {
    const storage = createTursoStorage(settings, {
      client,
      notificationOutbox: true,
    });
    const user = storage.forUser("alice");
    await user.getSettings();
    await client.execute(
      "CREATE TRIGGER fail_outbox BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
    let rejected = false;
    try {
      await user.saveMatch(record, { notify: true });
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true);
    assertEquals(await user.listHistory(), []);
    assertEquals((await user.getAppState()).totalMatches, 0);
    await client.execute("DROP TRIGGER fail_outbox");
    await user.saveMatch(record, { notify: true });
    await user.saveMatch({ ...record, keyword: "updated" }, { notify: true });
    assertEquals((await user.notificationOutbox!.claim(0)).length, 3);
    await user.deleteMatches([record.id]);
    assertEquals(await user.notificationOutbox!.claim(600000), []);
    await user.sync!.applyRecord(record.id, "workspace", {
      ...serverEditStamp(),
      editedAt: Date.now() + 1000,
    });
    assertEquals((await user.listPendingMatches()).length, 1);
    assertEquals(await user.notificationOutbox!.claim(600000), []);
    await user.saveMatch({ ...record, id: "plain" });
    assertEquals(await user.notificationOutbox!.claim(600000), []);
    const importer = createTursoStorage(settings, {
      client,
      writeMode: "kv-import",
      notificationOutbox: true,
    });
    await importer.forUser("bob").saveMatch(record, { notify: true });
    assertEquals(
      await importer.forUser("bob").notificationOutbox!.claim(600000),
      [],
    );
  } finally {
    client.close();
  }
});
