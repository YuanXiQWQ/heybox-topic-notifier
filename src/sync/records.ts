/** @file 定义记录管理状态的版本和删除墓碑，正文刷新不改变用户管理状态。 */
import type { MatchRecord } from "../models.ts";
import { baselineStamp, compareEdits, type EditStamp } from "./protocol.ts";

/** 工作区、历史完成和删除属于同一个冲突区域。 */
export type RecordStatus = "workspace" | "history" | "deleted";
/** 删除后保留同步墓碑及恢复所需的已同步记录。 */
export type RecordSyncSnapshot = {
  id: string;
  status: RecordStatus;
  stamp: EditStamp;
  record?: MatchRecord;
};
/** 一次记录操作的原子裁决结果。 */
export type RecordMerge = { snapshot?: RecordSyncSnapshot; applied: boolean };

/**
 * 给记录应用已裁决的管理状态，删除不产生可见记录。
 * @param {MatchRecord} record 最新业务内容。
 * @param {RecordSyncSnapshot | undefined} state 用户管理状态。
 * @return {MatchRecord | undefined} 应在业务表中保存的记录。
 */
export function projectRecord(
  record: MatchRecord,
  state?: RecordSyncSnapshot,
): MatchRecord | undefined {
  if (state?.status === "deleted") return undefined;
  const result = structuredClone(record);
  if (state?.status === "workspace") delete result.completedAt;
  if (state?.status === "history") {
    result.completedAt = new Date(state.stamp.editedAt).toISOString();
  }
  return result;
}

/**
 * 按编辑时间裁决管理操作，删除墓碑允许较晚的明确移动操作恢复记录。
 * @param {string} id 记录 ID。
 * @param {MatchRecord | undefined} record 当前可见记录。
 * @param {RecordSyncSnapshot | undefined} previous 已保存的管理版本。
 * @param {RecordStatus} status 目标状态。
 * @param {EditStamp} stamp 用户操作时间。
 * @return {RecordMerge} 管理状态及是否获胜。
 */
export function mergeRecord(
  id: string,
  record: MatchRecord | undefined,
  previous: RecordSyncSnapshot | undefined,
  status: RecordStatus,
  stamp: EditStamp,
): RecordMerge {
  if (compareEdits(stamp, previous?.stamp ?? baselineStamp) <= 0) {
    return { snapshot: previous, applied: false };
  }
  const content = record ?? previous?.record;
  if (!content && status !== "deleted") {
    return { snapshot: previous, applied: false };
  }
  return {
    snapshot: {
      id,
      status,
      stamp,
      record: content
        ? projectRecord(content, {
          id,
          status: status === "deleted" ? "workspace" : status,
          stamp,
        })
        : undefined,
    },
    applied: true,
  };
}
