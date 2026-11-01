/** @file 验证积压通知按工作区过滤、旧事件兼容和过滤后的分页推进。 */
import { assertEquals, assertRejects } from "@std/assert";
import { createKvStorage } from "../storage/kv.ts";
import { createTursoStorage } from "../storage/turso.ts";
import { MemorySqlClient } from "../storage/sqlite_test_helpers.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { enqueueNativeNotifications } from "./native_notifications.ts";
import { readActiveNativeNotifications } from "./native_inbox.ts";
import { sessionTokenHash } from "../auth/session.ts";
import type { MatchRecord } from "../models.ts";

for (const backend of ["kv", "turso"]) Deno.test(`native inbox filters handled backlog and preserves tests (${backend})`, async () => {
  const kv = await Deno.openKv(":memory:"), sql = new MemorySqlClient();
  try {
    const settings = defaultAppSettingsFromEnv();
    const storage = backend === "kv" ? createKvStorage(settings, { openKv: () => Promise.resolve(kv) }) : createTursoStorage(settings, { client: sql });
    const user = storage.forUser("alice"), now = new Date().toISOString();
    const record: MatchRecord = { id: "handled", keyword: "help", location: "title", matchedAt: now,
      post: { id: "post", title: "Help", body: "", excerpt: "", comments: [], commentReplies: [], url: "https://example.com", publishedAt: now } };
    await user.saveMatch(record);
    await enqueueNativeNotifications(storage, "alice", [record], settings);
    assertEquals((await readActiveNativeNotifications(user, "")).events.length, 1);
    await user.completeMatches([record.id]);
    const filtered = await readActiveNativeNotifications(user, "");
    assertEquals(filtered.events, []);
    assertEquals(filtered.cursor.length > 0, true);
    // 保持兼容旧事件的摘要映射，同时不允许其它账号工作区影响本账号。
    await user.nativeNotifications!.save({ id: await sessionTokenHash("legacy"), cursor: "", createdAt: Date.now(), title: "legacy", body: "", path: "/history" });
    await storage.forUser("bob").saveMatch({ ...record, id: "legacy" });
    assertEquals((await readActiveNativeNotifications(user, "")).events, []);
    await user.saveMatch({ ...record, id: "legacy" });
    assertEquals((await readActiveNativeNotifications(user, "")).events.length, 1);
    await user.deleteMatches(["legacy"]);
    await enqueueNativeNotifications(storage, "alice", { id: "test", title: "Test", body: "No record", path: "/settings" }, settings);
    const tested = await readActiveNativeNotifications(user, "");
    assertEquals(tested.events.map((event) => event.kind), ["service"]);
    assertEquals((await user.listPendingMatches()).length, 0);
    await assertRejects(() => readActiveNativeNotifications({ ...user,
      /** @return {Promise<never>} 模拟权威工作区暂不可读。 */
      listPendingMatchReferences: () => Promise.reject(new Error("offline")),
    }, ""), Error, "offline");
  } finally { kv.close(); sql.close(); }
});

Deno.test("filtered pages cannot strand legacy clients before later visible notifications", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const storage = createKvStorage(defaultAppSettingsFromEnv(), { openKv: () => Promise.resolve(kv) });
    const user = storage.forUser("alice");
    for (let i = 0; i < 101; i++) await user.nativeNotifications!.save({ id: await sessionTokenHash(String(i)), cursor: "", createdAt: Date.now(), title: "handled", body: "", path: "/history", ...(i < 100 ? { kind: "match" as const, matchId: String(i) } : {}) });
    const page = await readActiveNativeNotifications(user, "");
    assertEquals(page.events, []); assertEquals(page.hasMore, false);
    await user.saveMatch({ id: "100", keyword: "help", location: "title", matchedAt: new Date().toISOString(),
      post: { id: "p", title: "legacy pending", body: "", excerpt: "", comments: [], commentReplies: [], url: "https://example.com", publishedAt: "" } });
    assertEquals((await readActiveNativeNotifications(user, "")).events.map(event => event.id), [await sessionTokenHash("100")]);
    await user.completeMatches(["100"]);
    await enqueueNativeNotifications(storage, "alice", { id: "after-filtered-pages", title: "Test", body: "", path: "/settings" }, defaultAppSettingsFromEnv());
    const last = await readActiveNativeNotifications(user, "");
    assertEquals(last.events.length, 1); assertEquals(last.hasMore, false);
    assertEquals(last.cursor > page.cursor, true);
  } finally { kv.close(); }
});
