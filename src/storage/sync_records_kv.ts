/** @file 原子保存 KV 中的记录管理版本、可见记录和删除墓碑。 */
import type { MatchRecord } from "../models.ts";
import { compareEdits } from "../sync/protocol.ts";
import {
  mergeRecord,
  projectRecord,
  type RecordSyncSnapshot,
} from "../sync/records.ts";
import type { KvStore } from "./kv.ts";
import type { RecordSyncStore } from "./sync_records_types.ts";

/**
 * 创建账号记录同步存储。
 * @param {() => Promise<KvStore>} open 数据库获取器。
 * @param {string} userId 账号 ID。
 * @return {RecordSyncStore} 记录同步接口。
 */
export function createKvRecordSync(
  open: () => Promise<KvStore>,
  userId: string,
): RecordSyncStore {
  return {
    /**
     * 将状态与可见记录在同一比较交换事务中写入。
     * @param {string} id 记录 ID。
     * @param {import("../sync/records.ts").RecordStatus} status 目标状态。
     * @param {import("../sync/protocol.ts").EditStamp} stamp 编辑版本。
     * @return {Promise<import("../sync/records.ts").RecordMerge>} 合并结果。
     */
    async applyRecord(id, status, stamp) {
      const db = await open();
      const stateKey = ["userSync", userId, "record", id];
      const recordKey = ["userData", userId, "matches", id];
      for (let attempt = 0; attempt < 16; attempt++) {
        const state = await db.get<RecordSyncSnapshot>(stateKey);
        const record = await db.get<MatchRecord>(recordKey);
        const result = mergeRecord(
          id,
          record.value ?? undefined,
          state.value ?? undefined,
          status,
          stamp,
        );
        if (!result.applied || !result.snapshot) return result;
        const tx = db.atomic().check({
          key: stateKey,
          versionstamp: state.versionstamp,
        }).check({ key: recordKey, versionstamp: record.versionstamp }).set(
          stateKey,
          result.snapshot,
        );
        if (status === "deleted") tx.delete(recordKey);
        else tx.set(recordKey, result.snapshot.record);
        if ((await tx.commit()).ok) return result;
      }
      throw new Error("Record sync write conflict");
    },
    /**
     * 保留当前管理状态刷新业务内容，墓碑阻止后台抓取复活删除记录。
     * @param {MatchRecord} record 新内容。
     */
    async saveRecordContent(record) {
      const db = await open();
      const stateKey = ["userSync", userId, "record", record.id];
      const recordKey = ["userData", userId, "matches", record.id];
      for (let attempt = 0; attempt < 16; attempt++) {
        const state = await db.get<RecordSyncSnapshot>(stateKey);
        const current = await db.get<MatchRecord>(recordKey);
        const projected = projectRecord(record, state.value ?? undefined);
        if (!projected) return;
        if (current.value?.notifiedAt) {
          projected.notifiedAt = current.value.notifiedAt;
        }
        const tx = db.atomic().check({
          key: stateKey,
          versionstamp: state.versionstamp,
        }).check({ key: recordKey, versionstamp: current.versionstamp }).set(
          recordKey,
          projected,
        );
        if (state.value) {
          tx.set(stateKey, { ...state.value, record: projected });
        }
        const result = await tx.commit();
        if (result.ok) return;
      }
      throw new Error("Record content write conflict");
    },
    /**
     * 列出本账号持久管理状态。
     * @return {Promise<RecordSyncSnapshot[]>} 包含墓碑的状态。
     */
    async readRecordStates() {
      const db = await open();
      const states: RecordSyncSnapshot[] = [];
      for await (
        const item of db.list<RecordSyncSnapshot>({
          prefix: ["userSync", userId, "record"],
        })
      ) states.push(item.value);
      return states;
    },
    /**
     * 镜像权威状态，忽略版本较旧的延迟镜像。
     * @param {RecordSyncSnapshot} snapshot 权威状态。
     */
    async replaceRecord(snapshot) {
      const db = await open();
      const stateKey = ["userSync", userId, "record", snapshot.id];
      const recordKey = ["userData", userId, "matches", snapshot.id];
      for (let attempt = 0; attempt < 16; attempt++) {
        const state = await db.get<RecordSyncSnapshot>(stateKey);
        if (
          state.value && compareEdits(state.value.stamp, snapshot.stamp) >= 0
        ) return;
        const record = await db.get<MatchRecord>(recordKey);
        const tx = db.atomic().check({
          key: stateKey,
          versionstamp: state.versionstamp,
        }).check({ key: recordKey, versionstamp: record.versionstamp }).set(
          stateKey,
          snapshot,
        );
        if (snapshot.status === "deleted") tx.delete(recordKey);
        else if (snapshot.record) tx.set(recordKey, snapshot.record);
        if ((await tx.commit()).ok) return;
      }
      throw new Error("Record replica write conflict");
    },
  };
}
