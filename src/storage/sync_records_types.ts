/** @file 定义记录生命周期的原子同步接口。 */
import type { MatchRecord } from "../models.ts";
import type { EditStamp } from "../sync/protocol.ts";
import type {
  RecordMerge,
  RecordStatus,
  RecordSyncSnapshot,
} from "../sync/records.ts";

/** 后台内容刷新和用户操作共享的记录存储边界。 */
export type RecordSyncStore = {
  /**
   * 原子裁决一条记录的移动或删除。
   * @param {string} id 记录 ID。
   * @param {RecordStatus} status 目标状态。
   * @param {EditStamp} stamp 编辑版本。
   * @return {Promise<RecordMerge>} 原子裁决结果。
   */
  applyRecord(
    id: string,
    status: RecordStatus,
    stamp: EditStamp,
  ): Promise<RecordMerge>;
  /**
   * 刷新正文或通知元数据，保持已裁决的用户管理状态。
   * @param {MatchRecord} record 内容。
   */
  saveRecordContent(record: MatchRecord): Promise<void>;
  /**
   * 读取已管理记录的版本，包含删除墓碑。
   * @return {Promise<RecordSyncSnapshot[]>} 管理状态。
   */
  readRecordStates(): Promise<RecordSyncSnapshot[]>;
  /**
   * 按权威编辑版本复制管理状态，不使较早镜像覆盖较晚操作。
   * @param {RecordSyncSnapshot} snapshot 权威管理状态。
   */
  replaceRecord(snapshot: RecordSyncSnapshot): Promise<void>;
};
