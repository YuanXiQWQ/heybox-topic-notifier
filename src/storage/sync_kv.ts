/** @file 使用 KV 比较交换原子保存设置版本及业务投影。 */
import type { AppSettings } from "../models.ts";
import { initialSettingsSnapshot, mergeSettings } from "../sync/settings.ts";
import { type KvStore, normalizeSettings } from "./kv.ts";
import type { UserSyncStore } from "./sync_types.ts";
import { createKvRecordSync } from "./sync_records_kv.ts";
import {
  decodeSettingsSync,
  encodeSettingsSync,
  type StoredSettingsSync,
} from "./sync_codec.ts";

/**
 * 创建账号隔离的设置同步存储。
 * @param {() => Promise<KvStore>} open 获取数据库。
 * @param {string} userId 账号 ID。
 * @param {AppSettings} defaults 既有设置的默认值。
 * @return {UserSyncStore} 原子同步存储。
 */
export function createKvSyncStore(
  open: () => Promise<KvStore>,
  userId: string,
  defaults: AppSettings,
): UserSyncStore {
  const syncKey = ["userSync", userId, "settings"];
  const settingsKey = ["userData", userId, "settings"];
  return {
    ...createKvRecordSync(open, userId),
    /**
     * 读取同步快照或根据已有设置建立未持久化的基线。
     * @return {Promise<SettingsSyncSnapshot>} 快照。
     */
    async readSettings() {
      const db = await open();
      const sync = await db.get<StoredSettingsSync>(syncKey);
      if (sync.value) return await decodeSettingsSync(sync.value);
      const settings = await db.get<AppSettings>(settingsKey);
      return initialSettingsSnapshot(
        normalizeSettings(settings.value, defaults),
      );
    },
    /**
     * 并发变化时重新裁决，绝不使用进程内锁代替数据库事务。
     * @param {import("../sync/settings.ts").SettingsEdit[]} edits 待合并的区域。
     * @return {Promise<import("../sync/settings.ts").SettingsMerge>} 合并结果。
     */
    async applySettings(edits) {
      const db = await open();
      for (let attempt = 0; attempt < 16; attempt++) {
        const sync = await db.get<StoredSettingsSync>(syncKey);
        const settings = await db.get<AppSettings>(settingsKey);
        const current = sync.value
          ? await decodeSettingsSync(sync.value)
          : initialSettingsSnapshot(
            normalizeSettings(settings.value, defaults),
          );
        const result = mergeSettings(current, edits);
        if (!result.applied.length && sync.value) return result;
        if (result.snapshot.revision === "baseline") {
          result.snapshot.revision = crypto.randomUUID();
          result.snapshot.sequence = 1;
        }
        const committed = await db.atomic()
          .check({ key: syncKey, versionstamp: sync.versionstamp })
          .check({ key: settingsKey, versionstamp: settings.versionstamp })
          .set(syncKey, await encodeSettingsSync(result.snapshot)).set(
            settingsKey,
            result.snapshot.settings,
          ).commit();
        if (committed.ok) return result;
      }
      throw new Error("Settings sync write conflict");
    },
    /**
     * 原子安装权威库的区域版本和业务设置。
     * @param {SettingsSyncSnapshot} snapshot 权威快照。
     */
    async replaceSettings(snapshot) {
      const db = await open();
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await db.get<StoredSettingsSync>(syncKey);
        if (
          current.value &&
          (await decodeSettingsSync(current.value)).sequence > snapshot.sequence
        ) return;
        const result = await db.atomic().check({
          key: syncKey,
          versionstamp: current.versionstamp,
        })
          .set(syncKey, await encodeSettingsSync(snapshot)).set(
            settingsKey,
            snapshot.settings,
          ).commit();
        if (result.ok) return;
      }
      throw new Error("Settings replica write conflict");
    },
  };
}
