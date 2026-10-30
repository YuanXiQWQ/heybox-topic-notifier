/** @file 管理存储测试复用的内存 SQLite 客户端。 */
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
  type StatementResultingChanges,
  type StatementSync,
} from "node:sqlite";
import type { TursoClient } from "./turso.ts";
/**
 * 使用 Deno 内置 SQLite 执行 Turso 适配器 SQL 的测试客户端。
 */
export class MemorySqlClient implements TursoClient {
  /** 已执行的 SQL，用于验证查询数量和访问路径。 */
  readonly statements: string[] = [];
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
    this.statements.push(sql);
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
