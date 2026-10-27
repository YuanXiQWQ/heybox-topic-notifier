/** @file 使用 SQL 条件写入保证系统浏览器登录交接仅消费一次。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { NativeLoginStore } from "./native_login.ts";

/**
 * 创建原生登录交接接口。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行器。
 * @return {NativeLoginStore} 交接接口。
 */
export function createTursoNativeLogin(
  execute: (statement: InStatement) => Promise<ResultSet>,
): NativeLoginStore {
  return {
    /** @param {NativeLogin} value 待授权交接。 @return {Promise<boolean>} 是否创建成功。 */
    async create(value) {
      await execute({
        sql: "DELETE FROM native_login WHERE expires_at <= ?",
        args: [Date.now()],
      });
      return (await execute({
        sql:
          "INSERT OR IGNORE INTO native_login (id, challenge, expires_at) VALUES (?, ?, ?)",
        args: [value.id, value.challenge, value.expiresAt],
      })).rowsAffected === 1;
    },
    /** @param {string} id 交接 ID。 @return {Promise<NativeLogin | undefined>} 当前未过期状态。 */
    async read(id) {
      const result = await execute({
        sql: "SELECT * FROM native_login WHERE id = ? AND expires_at > ?",
        args: [id, Date.now()],
      });
      const row = result.rows[0];
      return row
        ? {
          id: String(row.id),
          challenge: String(row.challenge),
          expiresAt: Number(row.expires_at),
          userId: row.user_id ? String(row.user_id) : undefined,
          consumed: Boolean(row.consumed),
        }
        : undefined;
    },
    /** @param {string} id 交接 ID。 @param {string} userId 授权账号。 @return {Promise<boolean>} 是否成功。 */
    async approve(id, userId) {
      return (await execute({
        sql:
          "UPDATE native_login SET user_id = ? WHERE id = ? AND user_id IS NULL AND consumed = 0 AND expires_at > ?",
        args: [userId, id, Date.now()],
      })).rowsAffected === 1;
    },
    /** @param {string} id 交接 ID。 @param {string} challenge PKCE 摘要。 @return {Promise<string | undefined>} 单次授权账号。 */
    async consume(id, challenge) {
      const result = await execute({
        sql:
          "UPDATE native_login SET consumed = 1 WHERE id = ? AND challenge = ? AND user_id IS NOT NULL AND consumed = 0 AND expires_at > ? RETURNING user_id",
        args: [id, challenge, Date.now()],
      });
      return result.rows[0] ? String(result.rows[0].user_id) : undefined;
    },
  };
}
