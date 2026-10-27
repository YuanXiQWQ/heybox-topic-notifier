/** @file 使用索引从 libSQL 顺序补取原生通知事件。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import {
  type NativeNotification,
  nativeNotificationRetentionMs,
  type NativeNotificationStore,
} from "./native_notifications.ts";

/**
 * 创建具备事件唯一约束的账号收件箱。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行器。
 * @param {string} userId 账号 ID。
 * @return {NativeNotificationStore} 通知接口。
 */
export function createTursoNativeNotifications(
  execute: (statement: InStatement) => Promise<ResultSet>,
  userId: string,
): NativeNotificationStore {
  return {
    /**
     * 幂等插入事件并清理过期载荷。
     * @param {NativeNotification} event 通知事件。
     * @return {Promise<NativeNotification>} 带原子顺序游标的事件。
     */
    async save(event) {
      await execute({
        sql:
          `INSERT OR IGNORE INTO native_notifications (user_id, id, cursor, created_at, value_json)
        SELECT ?, ?, CASE WHEN ? != '' THEN ? ELSE printf('%016d', COALESCE((SELECT MAX(CAST(substr(cursor, 1, 16) AS INTEGER)) FROM native_notifications WHERE user_id = ?), 0) + 1) || ':' || ? END, ?, ?`,
        args: [
          userId,
          event.id,
          event.cursor,
          event.cursor,
          userId,
          event.id,
          event.createdAt,
          JSON.stringify(event),
        ],
      });
      const stored = await execute({
        sql:
          "SELECT cursor, value_json FROM native_notifications WHERE user_id = ? AND id = ?",
        args: [userId, event.id],
      });
      const saved = {
        ...JSON.parse(String(stored.rows[0].value_json)),
        cursor: String(stored.rows[0].cursor),
      };
      await execute({
        sql:
          "DELETE FROM native_notifications WHERE user_id = ? AND created_at < ?",
        args: [userId, Date.now() - nativeNotificationRetentionMs],
      });
      return saved;
    },
    /**
     * 首次读取只返回游标，之后按顺序分页补取。
     * @param {string | undefined} after 已消费游标。
     * @return {Promise<{events: NativeNotification[], cursor: string}>} 通知批次。
     */
    async read(after) {
      if (after === undefined) {
        const result = await execute({
          sql:
            "SELECT cursor FROM native_notifications WHERE user_id = ? ORDER BY cursor DESC LIMIT 1",
          args: [userId],
        });
        return { events: [], cursor: String(result.rows[0]?.cursor ?? "") };
      }
      const result = await execute({
        sql:
          "SELECT cursor, value_json FROM native_notifications WHERE user_id = ? AND cursor > ? AND created_at >= ? ORDER BY cursor LIMIT 100",
        args: [userId, after, Date.now() - nativeNotificationRetentionMs],
      });
      const events: NativeNotification[] = result.rows.map((row) => ({
        ...JSON.parse(String(row.value_json)),
        cursor: String(row.cursor),
      }));
      return { events, cursor: events.at(-1)?.cursor ?? after };
    },
  };
}
