/** @file 使用 libSQL 保存浏览器推送订阅并约束账号隔离。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { WebPushDevice, WebPushStore } from "./web_push_types.ts";

/**
 * 创建 SQL 浏览器订阅存储。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute 已初始化的 SQL 执行器。
 * @return {WebPushStore} 订阅存储。
 */
export function createTursoWebPushStore(
  execute: (statement: InStatement) => Promise<ResultSet>,
): WebPushStore {
  return {
    /**
     * 按用户索引读取订阅。
     * @param {string} userId 用户 ID。
     * @return {Promise<WebPushDevice[]>} 用户订阅。
     */
    async list(userId) {
      const result = await execute({
        sql: "SELECT value_json FROM web_push_devices WHERE user_id = ?",
        args: [userId],
      });
      return result.rows.map((row) =>
        JSON.parse(String(row.value_json)) as WebPushDevice
      );
    },
    /**
     * 以订阅 ID 为唯一键原子换绑当前会话。
     * @param {WebPushDevice} device 订阅设备。
     */
    async save(device) {
      await execute({
        sql:
          `INSERT INTO web_push_devices (id, user_id, value_json) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, value_json = excluded.value_json`,
        args: [device.id, device.userId, JSON.stringify(device)],
      });
    },
    /**
     * 只删除当前账号的订阅。
     * @param {string} id 订阅 ID。
     * @param {string} userId 用户 ID。
     * @param {string | undefined} sessionHash 清理时要求仍属于被检查的会话。
     */
    async remove(id, userId, sessionHash) {
      await execute({
        sql: `DELETE FROM web_push_devices WHERE id = ? AND user_id = ?${
          sessionHash
            ? " AND json_extract(value_json, '$.sessionHash') = ?"
            : ""
        }`,
        args: sessionHash ? [id, userId, sessionHash] : [id, userId],
      });
    },
  };
}
