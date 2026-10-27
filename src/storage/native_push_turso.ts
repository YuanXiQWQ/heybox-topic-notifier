/** @file 使用 libSQL 保存原生应用推送设备并约束账号隔离。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { NativePushDevice, NativePushStore } from "./native_push_types.ts";

/**
 * 创建 SQL 原生应用推送设备存储。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute 已初始化的 SQL 执行器。
 * @return {NativePushStore} 推送设备存储。
 */
export function createTursoNativePushStore(
  execute: (statement: InStatement) => Promise<ResultSet>,
): NativePushStore {
  return {
    /**
     * 按用户索引读取推送设备。
     * @param {string} userId 用户 ID。
     * @return {Promise<NativePushDevice[]>} 用户推送设备。
     */
    async list(userId) {
      const result = await execute({
        sql: "SELECT value_json FROM native_push_devices WHERE user_id = ?",
        args: [userId],
      });
      return result.rows.map((row) =>
        JSON.parse(String(row.value_json)) as NativePushDevice
      );
    },
    /**
     * 以推送设备 ID 为唯一键原子换绑当前会话。
     * @param {NativePushDevice} device 推送设备。
     */
    async save(device) {
      await execute({
        sql:
          `INSERT INTO native_push_devices (id, user_id, value_json) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, value_json = excluded.value_json`,
        args: [device.id, device.userId, JSON.stringify(device)],
      });
    },
    /**
     * 只删除当前账号的推送设备。
     * @param {string} id 推送设备 ID。
     * @param {string} userId 用户 ID。
     * @param {string | undefined} sessionHash 清理时要求仍属于被检查的会话。
     */
    async remove(id, userId, sessionHash) {
      await execute({
        sql: `DELETE FROM native_push_devices WHERE id = ? AND user_id = ?${
          sessionHash
            ? " AND json_extract(value_json, '$.sessionHash') = ?"
            : ""
        }`,
        args: sessionHash ? [id, userId, sessionHash] : [id, userId],
      });
    },
  };
}
