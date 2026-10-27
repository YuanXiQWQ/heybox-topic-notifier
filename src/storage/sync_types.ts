/** @file 定义设置同步的原子合并和权威镜像契约。 */
import type {
  SettingsEdit,
  SettingsMerge,
  SettingsSyncSnapshot,
} from "../sync/settings.ts";
import type { RecordSyncStore } from "./sync_records_types.ts";

/** 当前账号的持久同步状态。 */
export type UserSyncStore = RecordSyncStore & {
  /**
   * 读取版本与业务设置，既有数据使用确定的零版本。
   * @return {Promise<SettingsSyncSnapshot>} 同步快照。
   */
  readSettings(): Promise<SettingsSyncSnapshot>;
  /**
   * 在同一事务内裁决并保存区域版本和业务数据。
   * @param {SettingsEdit[]} edits 区域编辑。
   * @return {Promise<SettingsMerge>} 裁决结果。
   */
  applySettings(edits: SettingsEdit[]): Promise<SettingsMerge>;
  /**
   * 安装权威库已经裁决的快照，仅供受控双写使用。
   * @param {SettingsSyncSnapshot} snapshot 权威快照。
   */
  replaceSettings(snapshot: SettingsSyncSnapshot): Promise<void>;
};
