/**
 * @file 本文件验证 Turso 存储的 SQL 查询、原子约束、TTL 和用户隔离行为。
 */
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
  type StatementResultingChanges,
  type StatementSync,
} from "node:sqlite";
import type {
  AppSettings,
  AuthenticationEvent,
  MatchRecord,
  PasskeyCredential,
  PendingMfaChallenge,
  UserAccount,
  UserSession,
} from "../models.ts";
import { createTursoStorage, type TursoClient } from "./turso.ts";
import type { Storage } from "./types.ts";

Deno.test("Turso storage isolates users and replaces KV match prefix scans", async () => {
  await withStorage(async (storage) => {
    await storage.forUser("alice").saveMatch(record(
      "same-id",
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T01:00:00.000Z",
    ));
    await storage.forUser("bob").saveMatch(record(
      "same-id",
      "2026-09-02T00:00:00.000Z",
      "2026-09-02T01:00:00.000Z",
    ));
    await storage.forUser("alice").saveMatch({
      ...record(
        "completed-id",
        "2026-09-03T00:00:00.000Z",
        "2026-09-03T01:00:00.000Z",
      ),
      completedAt: "2026-09-03T02:00:00.000Z",
    });

    const snapshot = await storage.forUser("alice").getDashboardSnapshot();

    assertEquals(snapshot.state.totalMatches, 2);
    assertEquals(snapshot.state.latestMatch?.id, "completed-id");
    assertEquals(snapshot.pendingMatches.map((item) => item.id), ["same-id"]);
    assertEquals(
      (await storage.forUser("bob").listHistory()).map((item) => item.id),
      ["same-id"],
    );
  });
});

Deno.test("Turso storage updates and deletes matches without changing records", async () => {
  await withStorage(async (storage) => {
    const match = record(
      "match-id",
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T01:00:00.000Z",
    );
    await storage.saveMatch(match);
    await storage.markMatchNotified(match.id, "2026-09-01T02:00:00.000Z");
    await storage.completeMatches([match.id, match.id, ""]);

    const completed = (await storage.listHistory())[0];
    assertEquals(completed.id, match.id);
    assertEquals(completed.notifiedAt, "2026-09-01T02:00:00.000Z");
    assertEquals(typeof completed.completedAt, "string");
    assertEquals(await storage.listPendingMatches(), []);

    await storage.deleteMatches([match.id]);
    assertEquals(await storage.listHistory(), []);
  });
});

Deno.test("Turso account constraints preserve atomic username behavior", async () => {
  await withStorage(async (storage) => {
    const results = await Promise.all([
      storage.createAccount(account("first-id", "Alice")),
      storage.createAccount(account("second-id", "alice")),
    ]);
    assertEquals(results.toSorted(), [false, true]);

    const created = (await storage.listAccounts())[0];
    assertEquals(
      (await storage.getAccountByUsername(" ALICE "))?.id,
      created.id,
    );
    assertEquals(
      await storage.updateAccount({ ...created, username: "yuanxi" }),
      true,
    );
    assertEquals(await storage.getAccountByUsername("alice"), undefined);
    assertEquals(
      (await storage.getAccountByUsername("yuanxi"))?.id,
      created.id,
    );
  });
});

Deno.test("Turso authentication events can only be consumed once", async () => {
  await withStorage(async (storage) => {
    const event: AuthenticationEvent = {
      authenticatedAt: "2026-09-01T00:00:00.000Z",
      method: "password",
      purpose: "recovery_codes",
      strength: "strong",
      userId: "alice-id",
    };
    await storage.saveAuthenticationEvent(event);

    const consumed = await Promise.all([
      storage.consumeAuthenticationEvent("alice-id", "recovery_codes"),
      storage.consumeAuthenticationEvent("alice-id", "recovery_codes"),
    ]);
    assertEquals(consumed.filter(Boolean), [event]);
  });
});

Deno.test("Turso Passkey primary key replaces the KV reverse index", async () => {
  await withStorage(async (storage) => {
    const credential = passkey("alice-id", "credential-id");
    await storage.savePasskeyCredential(credential);

    await assertRejects(() =>
      storage.savePasskeyCredential(passkey("bob-id", "credential-id"))
    );
    assertEquals(
      (await storage.getPasskeyCredentialByCredentialId("credential-id"))
        ?.userId,
      "alice-id",
    );

    await storage.deletePasskeyCredential("alice-id", "credential-id");
    assertEquals(
      await storage.getPasskeyCredentialByCredentialId("credential-id"),
      undefined,
    );
  });
});

Deno.test("Turso expiring challenges are not returned after expiry", async () => {
  await withStorage(async (storage) => {
    const challenge: PendingMfaChallenge = {
      allowedMethods: ["email", "email", "passkey"],
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      id: "active-challenge",
      primaryMethod: "password",
      userId: "alice-id",
    };
    await storage.savePendingMfaChallenge(challenge);
    await storage.savePendingMfaChallenge({
      ...challenge,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      id: "expired-challenge",
    });

    assertEquals(
      (await storage.getPendingMfaChallenge(challenge.id))?.allowedMethods,
      ["email", "passkey"],
    );
    assertEquals(
      await storage.getPendingMfaChallenge("expired-challenge"),
      undefined,
    );
  });
});

Deno.test("Turso login and request counters update atomically", async () => {
  await withStorage(async (storage) => {
    const failures = await Promise.all(
      Array.from(
        { length: 5 },
        () => storage.recordLoginFailure("Alice", 5, 60_000),
      ),
    );
    assertEquals(Math.max(...failures.map((failure) => failure.failures)), 5);
    assertEquals(
      typeof (await storage.getLoginFailure("alice"))?.lockedUntil,
      "string",
    );

    const hits = await Promise.all(
      Array.from(
        { length: 5 },
        () => storage.recordRateLimitHit(["scope", "client"], 3, 60_000),
      ),
    );
    assertEquals(Math.max(...hits.map((hit) => hit.count)), 5);
    assertEquals(hits.filter((hit) => hit.allowed).length, 3);
  });
});

Deno.test("Turso sessions preserve the current session payload contract", async () => {
  await withStorage(async (storage) => {
    const session: UserSession = {
      createdAt: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      tokenHash: "token-hash",
      userId: "alice-id",
      username: "alice",
    };
    await storage.saveSession(session);
    assertEquals(await storage.getSession(session.tokenHash), session);
    await storage.deleteSession(session.tokenHash);
    assertEquals(await storage.getSession(session.tokenHash), undefined);
  });
});

Deno.test("Turso backfill guard preserves live writes and deletions", async () => {
  await withStorage(async (storage) => {
    const tursoStorage = storage as ReturnType<typeof createTursoStorage>;
    assertEquals(
      await tursoStorage.canImportKvEntity("session", "live-session"),
      true,
    );
    await storage.saveSession({
      ...testSession(),
      tokenHash: "live-session",
    });
    assertEquals(
      await tursoStorage.canImportKvEntity("session", "live-session"),
      false,
    );
    await storage.deleteSession("deleted-session");
    assertEquals(
      await tursoStorage.canImportKvEntity("session", "deleted-session"),
      false,
    );
  });
});

Deno.test("Turso KV import cannot race with a newer live write", async () => {
  const client = new MemorySqlClient();
  try {
    const liveStorage = createTursoStorage(defaultSettings, { client });
    const importStorage = createTursoStorage(defaultSettings, {
      client,
      writeMode: "kv-import",
    });
    await liveStorage.saveSession({
      ...testSession(),
      tokenHash: "shared-session",
      username: "newer-live-value",
    });

    await assertRejects(() =>
      importStorage.saveSession({
        ...testSession(),
        tokenHash: "shared-session",
        username: "older-kv-value",
      })
    );

    assertEquals(
      (await liveStorage.getSession("shared-session"))?.username,
      "newer-live-value",
    );
  } finally {
    client.close();
  }
});

/**
 * 使用独立内存 libSQL 数据库运行测试。
 *
 * @param {(storage: Storage) => Promise<void>} run 测试逻辑。
 * @return {Promise<void>} 测试完成后的 Promise。
 */
async function withStorage(
  run: (storage: Storage) => Promise<void>,
): Promise<void> {
  const client = new MemorySqlClient();
  try {
    await run(createTursoStorage(defaultSettings, { client }));
  } finally {
    client.close();
  }
}

/**
 * 使用 Deno 内置 SQLite 执行 Turso 适配器 SQL 的测试客户端。
 */
class MemorySqlClient implements TursoClient {
  /**
   * 内存 SQLite 数据库。
   */
  readonly #database = new DatabaseSync(":memory:");

  /**
   * 执行单条 SQL。
   *
   * @param {Parameters<TursoClient["execute"]>[0]} statement SQL 语句。
   * @return {ReturnType<TursoClient["execute"]>} SQL 结果。
   */
  execute(
    statement: Parameters<TursoClient["execute"]>[0],
  ): ReturnType<TursoClient["execute"]> {
    return Promise.resolve(this.#execute(statement));
  }

  /**
   * 在事务中批量执行 SQL。
   *
   * @param {Parameters<TursoClient["batch"]>[0]} statements SQL 语句列表。
   * @param {Parameters<TursoClient["batch"]>[1]} _mode 事务模式。
   * @return {ReturnType<TursoClient["batch"]>} SQL 结果列表。
   */
  batch(
    statements: Parameters<TursoClient["batch"]>[0],
    _mode?: Parameters<TursoClient["batch"]>[1],
  ): ReturnType<TursoClient["batch"]> {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) =>
        this.#execute(
          Array.isArray(statement)
            ? { sql: statement[0], args: statement[1] }
            : statement,
        )
      );
      this.#database.exec("COMMIT");
      return Promise.resolve(results);
    } catch (error) {
      this.#database.exec("ROLLBACK");
      return Promise.reject(error);
    }
  }

  /**
   * 关闭内存数据库。
   */
  close(): void {
    this.#database.close();
  }

  /**
   * 同步执行单条 SQL 并转换为 libSQL 结果结构。
   *
   * @param {Parameters<TursoClient["execute"]>[0]} statement SQL 语句。
   * @return {Awaited<ReturnType<TursoClient["execute"]>>} libSQL 结果。
   */
  #execute(
    statement: Parameters<TursoClient["execute"]>[0],
  ): Awaited<ReturnType<TursoClient["execute"]>> {
    const sql = typeof statement === "string" ? statement : statement.sql;
    const args = typeof statement === "string" ? undefined : statement.args;
    const prepared = this.#database.prepare(sql);
    prepared.setAllowBareNamedParameters(true);
    const returnsRows = /^\s*(?:EXPLAIN|PRAGMA|SELECT|WITH)\b/i.test(sql) ||
      /\bRETURNING\b/i.test(sql);
    if (returnsRows) {
      const rows = executeAll(prepared, args);
      return resultSet(rows, rows.length);
    }
    const runResult = executeRun(prepared, args);
    return resultSet([], Number(runResult.changes), runResult.lastInsertRowid);
  }
}

/**
 * 执行会返回数据行的 SQLite 语句。
 *
 * @param {StatementSync} statement SQLite 预编译语句。
 * @param {unknown} args SQL 参数。
 * @return {Record<string, SQLOutputValue>[]} 查询结果行。
 */
function executeAll(
  statement: StatementSync,
  args: unknown,
): Record<string, SQLOutputValue>[] {
  if (Array.isArray(args)) {
    return statement.all(...args.map(sqlInputValue));
  }
  if (args && typeof args === "object") {
    return statement.all(namedSqlInputValues(args as Record<string, unknown>));
  }
  return statement.all();
}

/**
 * 执行不会返回数据行的 SQLite 语句。
 *
 * @param {StatementSync} statement SQLite 预编译语句。
 * @param {unknown} args SQL 参数。
 * @return {StatementResultingChanges} 写入统计。
 */
function executeRun(
  statement: StatementSync,
  args: unknown,
): StatementResultingChanges {
  if (Array.isArray(args)) {
    return statement.run(...args.map(sqlInputValue));
  }
  if (args && typeof args === "object") {
    return statement.run(namedSqlInputValues(args as Record<string, unknown>));
  }
  return statement.run();
}

/**
 * 转换 libSQL 输入值为 SQLite 输入值。
 *
 * @param {unknown} value libSQL 输入值。
 * @return {SQLInputValue} SQLite 输入值。
 */
function sqlInputValue(value: unknown): SQLInputValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (
    value === null || typeof value === "string" ||
    typeof value === "number" || typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SQLInputValue;
  }
  throw new TypeError("Unsupported SQL test value.");
}

/**
 * 转换命名 SQL 参数。
 *
 * @param {Record<string, unknown>} values libSQL 命名参数。
 * @return {Record<string, SQLInputValue>} SQLite 命名参数。
 */
function namedSqlInputValues(
  values: Record<string, unknown>,
): Record<string, SQLInputValue> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, sqlInputValue(value)]),
  );
}

/**
 * 创建兼容 libSQL 的查询结果。
 *
 * @param {Record<string, SQLOutputValue>[]} rows SQLite 查询结果行。
 * @param {number} rowsAffected 受影响行数。
 * @param {number | bigint} lastInsertRowid 最后插入行 ID。
 * @return {Awaited<ReturnType<TursoClient["execute"]>>} libSQL 查询结果。
 */
function resultSet(
  rows: Record<string, SQLOutputValue>[],
  rowsAffected: number,
  lastInsertRowid?: number | bigint,
): Awaited<ReturnType<TursoClient["execute"]>> {
  return {
    columns: rows[0] ? Object.keys(rows[0]) : [],
    columnTypes: [],
    lastInsertRowid: lastInsertRowid === undefined
      ? undefined
      : BigInt(lastInsertRowid),
    rows: rows as Awaited<ReturnType<TursoClient["execute"]>>["rows"],
    rowsAffected,
    toJSON: () => ({ rows, rowsAffected }),
  };
}

/**
 * 创建测试命中记录。
 *
 * @param {string} id 记录和帖子 ID。
 * @param {string} matchedAt 命中时间。
 * @param {string} publishedAt 发布时间。
 * @return {MatchRecord} 测试命中记录。
 */
function record(
  id: string,
  matchedAt: string,
  publishedAt: string,
): MatchRecord {
  return {
    id,
    keyword: "keyword",
    location: "title",
    matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

/**
 * 创建测试账号。
 *
 * @param {string} id 账号 ID。
 * @param {string} username 用户名。
 * @return {UserAccount} 测试账号。
 */
function account(id: string, username: string): UserAccount {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    id,
    username,
  };
}

/**
 * 创建测试 Passkey 凭证。
 *
 * @param {string} userId 用户 ID。
 * @param {string} credentialId 凭证 ID。
 * @return {PasskeyCredential} 测试凭证。
 */
function passkey(userId: string, credentialId: string): PasskeyCredential {
  return {
    counter: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    credentialId,
    publicKey: "public-key",
    userId,
  };
}

/**
 * 创建测试会话。
 *
 * @return {UserSession} 测试会话。
 */
function testSession(): UserSession {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    tokenHash: "token-hash",
    userId: "alice-id",
    username: "alice",
  };
}

/**
 * 断言 Promise 会被拒绝。
 *
 * @param {() => Promise<unknown>} run 异步操作。
 * @return {Promise<void>} 断言完成后的 Promise。
 */
async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("Expected promise to reject.");
}

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param {unknown} actual 实际值。
 * @param {unknown} expected 期望值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

/**
 * Turso 存储测试使用的默认设置。
 */
const defaultSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "",
  notificationEmailApiToken: "",
  notificationEmailApiUrl: "",
  notificationEmailFrom: "",
  notificationEmailService: "smtp",
  notificationProvider: "disabled",
  notificationPushPlusToken: "",
  notificationServerChanSendKey: "",
  notificationSmtpHost: "",
  notificationSmtpPassword: "",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "",
  notificationWxPusherSpt: "",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
    postLimit: 20,
    sort: "replyTime",
  },
  themeColor: "#bd7fff",
  topics: [],
};
