/** @file 验证角标版本、精简 SQL、用户隔离及并发修改后的重新同步。 */
import { assert, assertEquals } from "../test_helpers.ts";
import { MemorySqlClient } from "../storage/sqlite_test_helpers.ts";
import { createTursoStorage } from "../storage/turso.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { readNativeBadge } from "./native_badge.ts";
import type { MatchRecord } from "../models.ts";

/**
 * 构造同一帖子可被多个规则命中的业务记录。
 * @param {string} id 记录标识。
 * @return {MatchRecord} 带有正文的待确认记录。
 */
function match(id: string): MatchRecord {
  return {
    id, keyword: "help", location: "title", matchedAt: "2026-10-30T00:00:00.000Z",
    post: { id: "post", title: "help", body: "large body".repeat(1000), excerpt: "", comments: [], commentReplies: [], url: "https://example.com", publishedAt: "2026-10-30T00:00:00.000Z" },
  };
}

Deno.test("badge versions skip unchanged records and preserve distinct posts, account isolation and legacy snapshots", async () => {
  const client = new MemorySqlClient();
  try {
    const storage = createTursoStorage(defaultAppSettingsFromEnv(), { client });
    const alice = storage.forUser("alice"), bob = storage.forUser("bob");
    await alice.saveMatch(match("a"));
    await alice.saveMatch(match("b"));
    await bob.saveMatch(match("other"));
    const first = await readNativeBadge(alice, "alice", "");
    assert("records" in first);
    assertEquals(first.count, 1);
    assertEquals(first.records, [{ id: "a", postId: "post" }, { id: "b", postId: "post" }]);
    assert(first.version);
    const queries = client.statements.length;
    assertEquals(await readNativeBadge(alice, "alice", first.version), { userId: "alice", version: first.version, unchanged: true });
    assertEquals(client.statements.length - queries, 1);
    assert(!client.statements.at(-1)!.includes("FROM matches"));
    const foreign = await readNativeBadge(bob, "bob", first.version);
    assert("records" in foreign);
    assertEquals(foreign.records, [{ id: "other", postId: "post" }]);
    const legacy = await readNativeBadge(alice, "alice");
    assertEquals(legacy, { userId: "alice", count: 1, records: first.records });
    assert(client.statements.at(-1)!.includes("SELECT id, json_extract"));
    await alice.completeMatches(["a", "b"]);
    const completed = await readNativeBadge(alice, "alice", first.version);
    assert("records" in completed);
    assertEquals(completed.count, 0);
    const editedAt = Date.now() + 1000;
    await alice.sync!.applyRecord("a", "workspace", { editedAt, counter: 0, deviceId: "test", operationId: "restore" });
    const restored = await readNativeBadge(alice, "alice", completed.version);
    assert("records" in restored);
    assertEquals(restored.count, 1);
    await alice.sync!.applyRecord("a", "deleted", { editedAt: editedAt + 1, counter: 0, deviceId: "test", operationId: "delete" });
    const deleted = await readNativeBadge(alice, "alice", restored.version);
    assert("records" in deleted);
    assertEquals(deleted.count, 0);
  } finally { client.close(); }
});

Deno.test("badge snapshot takes its version before reading records so concurrent writes are not hidden", async () => {
  const client = new MemorySqlClient();
  try {
    const alice = createTursoStorage(defaultAppSettingsFromEnv(), { client }).forUser("alice");
    const racing = {
      ...alice,
      /** @return {Promise<Array<{id: string, postId: string}>>} 读取后发生并发写入的旧快照。 */
      async listPendingMatchReferences() {
        const records = await alice.listPendingMatchReferences!();
        await alice.saveMatch(match("racing"));
        return records;
      },
    };
    const old = await readNativeBadge(racing, "alice", "");
    assert("records" in old);
    assertEquals(old.records, []);
    const next = await readNativeBadge(alice, "alice", old.version);
    assert("records" in next);
    assertEquals(next.records, [{ id: "racing", postId: "post" }]);
  } finally { client.close(); }
});
