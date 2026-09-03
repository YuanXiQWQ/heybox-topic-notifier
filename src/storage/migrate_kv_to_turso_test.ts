/**
 * @file 本文件验证 KV 回填会保留实时变更、跳过过期数据并按 family 统计。
 */
import type { AppSettings, UserSession } from "../models.ts";
import {
  type KvMigrationSource,
  migrateKvToTurso,
} from "./migrate_kv_to_turso.ts";
import type { TursoStorage } from "./turso.ts";
import type { UserStorage } from "./types.ts";

Deno.test("KV backfill skips live mutations, indexes and expired sessions", async () => {
  const now = Date.parse("2026-09-03T00:00:00.000Z");
  const calls: string[] = [];
  const source = new MemoryMigrationSource([
    {
      key: ["accounts", "alice-id"],
      value: {
        createdAt: "2026-09-01T00:00:00.000Z",
        id: "alice-id",
        username: "alice",
      },
    },
    { key: ["accountUsernames", "alice"], value: "alice-id" },
    { key: ["userData", "alice-id", "settings"], value: defaultSettings },
    {
      key: ["sessions", "active-session"],
      value: session("active-session", "2026-09-04T00:00:00.000Z"),
    },
    {
      key: ["sessions", "expired-session"],
      value: session("expired-session", "2026-09-02T00:00:00.000Z"),
    },
  ]);
  const target = migrationTarget(calls, new Set(["account:alice-id"]));

  const report = await migrateKvToTurso(source, target, now);

  assertEquals(report.scanned, 5);
  assertEquals(report.imported, 2);
  assertEquals(report.skipped, 3);
  assertEquals(report.failed, 0);
  assertEquals(calls, ["session:active-session", "alice-id:settings"]);
  assertEquals(report.families.sessions, {
    failed: 0,
    imported: 1,
    skipped: 1,
  });
});

Deno.test("KV backfill records one failed entry without exposing its key", async () => {
  const source = new MemoryMigrationSource([
    {
      key: ["userData", "alice-id", "matches", "match-id"],
      value: {},
    },
  ]);
  const target = migrationTarget([], new Set(), true);

  const report = await migrateKvToTurso(source, target);

  assertEquals(report.failed, 1);
  assertEquals(report.families.userData.failed, 1);
});

/**
 * 测试使用的 KV 迁移数据源。
 */
class MemoryMigrationSource implements KvMigrationSource {
  /**
   * 创建内存迁移数据源。
   *
   * @param {{key: Deno.KvKey; value: unknown}[]} entries KV 记录。
   */
  constructor(
    private readonly entries: { key: Deno.KvKey; value: unknown }[],
  ) {}

  /**
   * 按前缀列出 KV 记录。
   *
   * @param {{prefix: Deno.KvKey}} selector KV 列表选择器。
   * @return {AsyncIterableIterator<{key: Deno.KvKey; value: T}>} KV 记录迭代器。
   */
  async *list<T>(
    selector: { prefix: Deno.KvKey },
  ): AsyncIterableIterator<{ key: Deno.KvKey; value: T }> {
    for (const entry of this.entries) {
      const matches = selector.prefix.every((part, index) =>
        entry.key[index] === part
      );
      if (matches) {
        yield { key: entry.key, value: entry.value as T };
      }
    }
  }
}

/**
 * 创建迁移目标替身。
 *
 * @param {string[]} calls 保存调用记录。
 * @param {Set<string>} blocked 已有实时变更标记。
 * @param {boolean} failMatches 是否让命中记录保存失败。
 * @return {TursoStorage} 迁移目标替身。
 */
function migrationTarget(
  calls: string[],
  blocked: Set<string>,
  failMatches = false,
): TursoStorage {
  const forUser = (userId: string): UserStorage => ({
    saveMatch: () =>
      failMatches
        ? Promise.reject(new Error("invalid match"))
        : Promise.resolve(),
    saveSettings: () => {
      calls.push(`${userId}:settings`);
      return Promise.resolve();
    },
  } as unknown as UserStorage);
  return {
    canImportKvEntity: (entityType: string, entityKey: string) =>
      Promise.resolve(!blocked.has(`${entityType}:${entityKey}`)),
    forUser,
    saveAccount: () => Promise.resolve(),
    saveSession: (value: UserSession) => {
      calls.push(`session:${value.tokenHash}`);
      return Promise.resolve();
    },
  } as unknown as TursoStorage;
}

/**
 * 创建测试会话。
 *
 * @param {string} tokenHash 会话令牌哈希。
 * @param {string} expiresAt 过期时间。
 * @return {UserSession} 测试会话。
 */
function session(tokenHash: string, expiresAt: string): UserSession {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt,
    tokenHash,
    userId: "alice-id",
    username: "alice",
  };
}

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param {unknown} actual 实际值。
 * @param {unknown} expected 期望值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Values are not equal.");
  }
}

/**
 * 迁移测试使用的最小设置。
 */
const defaultSettings = { locale: "zh-CN" } as AppSettings;
