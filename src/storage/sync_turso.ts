/** @file 使用 libSQL 事务及版本比较同步保存设置和冲突区域。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { AppSettings } from "../models.ts";
import {
  initialSettingsSnapshot,
  mergeSettings,
  type SettingsSyncSnapshot,
} from "../sync/settings.ts";
import { normalizeSettings } from "./kv.ts";
import type { UserSyncStore } from "./sync_types.ts";
import { createTursoRecordSync } from "./sync_records_turso.ts";

/**
 * 创建使用数据库事务保护的账号同步存储。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute 单条 SQL。
 * @param {(statements: InStatement[]) => Promise<ResultSet[]>} batch 原子事务。
 * @param {string} userId 账号 ID。
 * @param {AppSettings} defaults 默认设置。
 * @return {UserSyncStore} 同步存储。
 */
export function createTursoSyncStore(
  execute: (statement: InStatement) => Promise<ResultSet>,
  batch: (statements: InStatement[]) => Promise<ResultSet[]>,
  userId: string,
  defaults: AppSettings,
): UserSyncStore {
  /**
   * 生成投影写入与迁移保护语句，必须与版本写入在同一事务执行。
   * @param {SettingsSyncSnapshot} snapshot 权威快照。
   * @return {InStatement[]} 事务语句。
   */
  function projection(snapshot: SettingsSyncSnapshot): InStatement[] {
    return [
      {
        sql:
          "INSERT INTO user_settings (user_id, value_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json",
        args: [userId, JSON.stringify(snapshot.settings)],
      },
      {
        sql:
          "INSERT INTO storage_mutations (entity_type, entity_key, mutated_at) VALUES ('settings', ?, ?) ON CONFLICT(entity_type, entity_key) DO UPDATE SET mutated_at = excluded.mutated_at",
        args: [userId, new Date().toISOString()],
      },
    ];
  }
  const store: UserSyncStore = {
    ...createTursoRecordSync(execute, batch, userId),
    /**
     * 从版本行读取快照，或读取还未参与同步的已有设置。
     * @return {Promise<SettingsSyncSnapshot>} 快照。
     */
    async readSettings() {
      const sync = await execute({
        sql: "SELECT value_json FROM sync_settings WHERE user_id = ?",
        args: [userId],
      });
      if (sync.rows[0]) return JSON.parse(String(sync.rows[0].value_json));
      const settings = await execute({
        sql: "SELECT value_json FROM user_settings WHERE user_id = ?",
        args: [userId],
      });
      return initialSettingsSnapshot(
        normalizeSettings(
          settings.rows[0]
            ? JSON.parse(String(settings.rows[0].value_json))
            : null,
          defaults,
        ),
      );
    },
    /**
     * 比较版本后在同一事务写入全部投影；竞争失败的事务回滚并重新裁决。
     * @param {import("../sync/settings.ts").SettingsEdit[]} edits 待合并的区域。
     * @return {Promise<import("../sync/settings.ts").SettingsMerge>} 合并结果。
     */
    async applySettings(edits) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await store.readSettings();
        const result = mergeSettings(current, edits);
        if (!result.applied.length && current.revision !== "baseline") {
          return result;
        }
        if (result.snapshot.revision === "baseline") {
          result.snapshot.revision = crypto.randomUUID();
          result.snapshot.sequence = 1;
        }
        try {
          await batch([
            "DELETE FROM sync_transaction_guard",
            {
              sql:
                `INSERT INTO sync_settings (user_id, revision, value_json) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, value_json = excluded.value_json WHERE sync_settings.revision = ?`,
              args: [
                userId,
                result.snapshot.revision,
                JSON.stringify(result.snapshot),
                current.revision,
              ],
            },
            "INSERT INTO sync_transaction_guard (id) VALUES (CASE WHEN changes() = 1 THEN 1 ELSE 0 END)",
            ...projection(result.snapshot),
            "DELETE FROM sync_transaction_guard",
          ]);
          return result;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes("sync_guard_valid")
          ) throw error;
        }
      }
      throw new Error("Settings sync write conflict");
    },
    /**
     * 将权威库结果完整镜像，镜像端不重新生成时间或裁决冲突。
     * @param {SettingsSyncSnapshot} snapshot 权威快照。
     */
    async replaceSettings(snapshot) {
      try {
        await batch([
          "DELETE FROM sync_transaction_guard",
          {
            sql:
              "INSERT INTO sync_settings (user_id, revision, value_json) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, value_json = excluded.value_json WHERE json_extract(sync_settings.value_json, '$.sequence') <= json_extract(excluded.value_json, '$.sequence')",
            args: [userId, snapshot.revision, JSON.stringify(snapshot)],
          },
          "INSERT INTO sync_transaction_guard (id) VALUES (CASE WHEN changes() = 1 THEN 1 ELSE 0 END)",
          ...projection(snapshot),
          "DELETE FROM sync_transaction_guard",
        ]);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("sync_guard_valid")
        ) throw error;
      }
    },
  };
  return store;
}
