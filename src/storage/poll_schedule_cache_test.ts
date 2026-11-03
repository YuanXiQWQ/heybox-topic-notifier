/** @file 验证常驻调度缓存的查询用量、写后可见性、并发竞争和失败重试。 */
import { assertEquals } from "../test_helpers.ts";
import { defaultAppSettingsFromEnv } from "../services/default_settings.ts";
import { serverEditStamp } from "../sync/protocol.ts";
import { settingsEdits } from "../sync/settings.ts";
import { cachePollSchedule } from "./poll_schedule_cache.ts";
import { MemorySqlClient } from "./sqlite_test_helpers.ts";
import { createTursoStorage } from "./turso.ts";
import type { PollScheduleEntry, Storage } from "./types.ts";

/** 缓存与同步测试共用的完整默认设置。 */
const defaults = defaultAppSettingsFromEnv();

Deno.test("schedule cache shares one database snapshot and observes saved/offline settings and manual polls", async () => {
  const client = new MemorySqlClient();
  try {
    let clock = 1000;
    const backend = createTursoStorage(defaults, { client });
    const storage = cachePollSchedule(backend, 60_000, () => clock);
    await storage.saveAccount({ id: "alice", username: "alice", createdAt: "2026-01-01T00:00:00Z" });
    const user = storage.forUser("alice");
    await user.saveSettings({ ...defaults, polling: { ...defaults.polling, enabled: true } });
    const first = await storage.listPollSchedule!();
    assertEquals(first[0].settings.polling.enabled, true);
    const queries = client.statements.length;
    for (let i = 0; i < 60; i++) await storage.listPollSchedule!();
    assertEquals(client.statements.length, queries);
    first[0].settings.polling.enabled = false;
    assertEquals((await storage.listPollSchedule!())[0].settings.polling.enabled, true);

    await user.setLastPollAt("2026-11-03T00:00:00Z");
    const afterManual = client.statements.length;
    assertEquals((await storage.listPollSchedule!())[0].lastPollAt, "2026-11-03T00:00:00Z");
    assertEquals(client.statements.length, afterManual);

    const current = await user.getSettings();
    await user.saveSettings({ ...current, polling: { ...current.polling, enabled: false } });
    assertEquals((await storage.listPollSchedule!())[0].settings.polling.enabled, false);
    const offline = await user.sync!.readSettings();
    await user.sync!.applySettings(settingsEdits(offline.settings, { ...offline.settings, polling: { ...offline.settings.polling, enabled: true } }, serverEditStamp()));
    assertEquals((await storage.listPollSchedule!())[0].settings.polling.enabled, true);

    await backend.forUser("alice").setLastPollAt("2026-11-03T00:01:00Z");
    clock += 60_000;
    assertEquals((await storage.listPollSchedule!())[0].lastPollAt, "2026-11-03T00:01:00Z");
    await storage.createAccount({ id: "bob", username: "bob", createdAt: "2026-01-01T00:00:00Z" });
    assertEquals((await storage.listPollSchedule!()).map((entry) => entry.userId), ["alice", "bob"]);
  } finally { client.close(); }
});

Deno.test("schedule cache discards an in-flight snapshot that predates a committed write", async () => {
  const pending = Promise.withResolvers<PollScheduleEntry[]>();
  let reads = 0;
  const entry = { userId: "alice", settings: defaults };
  const storage = cachePollSchedule({
    listPollSchedule: () => ++reads === 1 ? pending.promise : Promise.resolve([entry]),
    saveAccount: () => Promise.resolve(),
  } as unknown as Storage);
  const first = storage.listPollSchedule!();
  const concurrent = storage.listPollSchedule!();
  await storage.saveAccount({ id: "alice", username: "alice", createdAt: "2026-01-01T00:00:00Z" });
  pending.resolve([]);
  assertEquals(await first, [entry]);
  assertEquals(await concurrent, [entry]);
  assertEquals(reads, 2);
  await storage.listPollSchedule!();
  assertEquals(reads, 2);
});

Deno.test("schedule cache retries failed refreshes and does not serve expired settings", async () => {
  let fail = false, reads = 0, clock = 0;
  const storage = cachePollSchedule({ listPollSchedule: () => {
    reads++;
    return fail ? Promise.reject(new Error("offline")) : Promise.resolve([]);
  } } as unknown as Storage, 60_000, () => clock);
  await storage.listPollSchedule!();
  fail = true;
  clock = 60_000;
  let rejected = false;
  try { await storage.listPollSchedule!(); } catch { rejected = true; }
  assertEquals(rejected, true);
  fail = false;
  assertEquals(await storage.listPollSchedule!(), []);
  assertEquals(reads, 3);
});
