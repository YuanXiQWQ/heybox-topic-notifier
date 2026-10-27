/** @file 使用 libSQL 事务保护记录正文和管理版本，删除保留同步墓碑。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { MatchRecord } from "../models.ts";
import { compareEdits } from "../sync/protocol.ts";
import {
  mergeRecord,
  projectRecord,
  type RecordSyncSnapshot,
} from "../sync/records.ts";
import type { RecordSyncStore } from "./sync_records_types.ts";

/** 一次一致读取中的原始 JSON，用于事务内比较。 */
type StoredRecord = {
  stateJson: string | null;
  recordJson: string | null;
  state?: RecordSyncSnapshot;
  record?: MatchRecord;
};

/**
 * 创建账号记录同步接口。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行器。
 * @param {(statements: InStatement[]) => Promise<ResultSet[]>} batch 原子事务执行器。
 * @param {string} userId 账号 ID。
 * @return {RecordSyncStore} 记录同步接口。
 */
export function createTursoRecordSync(
  execute: (statement: InStatement) => Promise<ResultSet>,
  batch: (statements: InStatement[]) => Promise<ResultSet[]>,
  userId: string,
): RecordSyncStore {
  /**
   * 在同一 SQL 快照中读取记录及管理版本。
   * @param {string} id 记录 ID。
   * @return {Promise<StoredRecord>} 当前版本与内容。
   */
  async function read(id: string): Promise<StoredRecord> {
    const result = await execute({
      sql:
        "SELECT (SELECT value_json FROM sync_records WHERE user_id = ? AND id = ?) AS state_json, (SELECT value_json FROM matches WHERE user_id = ? AND id = ?) AS record_json",
      args: [userId, id, userId, id],
    });
    const stateJson = result.rows[0]?.state_json == null
      ? null
      : String(result.rows[0].state_json);
    const recordJson = result.rows[0]?.record_json == null
      ? null
      : String(result.rows[0].record_json);
    return {
      stateJson,
      recordJson,
      state: stateJson ? JSON.parse(stateJson) : undefined,
      record: recordJson ? JSON.parse(recordJson) : undefined,
    };
  }
  /**
   * 比较读到的两个版本并提交投影和迁移标记；冲突时整个事务回滚。
   * @param {string} id 记录 ID。
   * @param {StoredRecord} before 读取时的状态。
   * @param {RecordSyncSnapshot | undefined} state 新管理状态，省略表示仅更新正文。
   * @param {MatchRecord | undefined} record 新可见记录，省略表示删除。
   * @return {Promise<boolean>} 是否成功提交。
   */
  async function commit(
    id: string,
    before: StoredRecord,
    state: RecordSyncSnapshot | undefined,
    record: MatchRecord | undefined,
  ): Promise<boolean> {
    const statements: InStatement[] = [
      "DELETE FROM sync_transaction_guard",
      {
        sql: `INSERT INTO sync_transaction_guard (id) SELECT CASE WHEN
        (SELECT value_json FROM sync_records WHERE user_id = ? AND id = ?) IS ? AND
        (SELECT value_json FROM matches WHERE user_id = ? AND id = ?) IS ? THEN 1 ELSE 0 END`,
        args: [userId, id, before.stateJson, userId, id, before.recordJson],
      },
    ];
    if (state) {
      statements.push({
        sql:
          "INSERT INTO sync_records (user_id, id, value_json) VALUES (?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET value_json = excluded.value_json",
        args: [userId, id, JSON.stringify(state)],
      });
    }
    if (record) {
      statements.push({
        sql:
          `INSERT INTO matches (user_id, id, matched_at, post_published_at, completed_at, notified_at, value_json) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET matched_at = excluded.matched_at, post_published_at = excluded.post_published_at, completed_at = excluded.completed_at, notified_at = excluded.notified_at, value_json = excluded.value_json`,
        args: [
          userId,
          id,
          record.matchedAt,
          record.post.publishedAt,
          record.completedAt ?? null,
          record.notifiedAt ?? null,
          JSON.stringify(record),
        ],
      });
    } else {statements.push({
        sql: "DELETE FROM matches WHERE user_id = ? AND id = ?",
        args: [userId, id],
      });}
    const key = JSON.stringify([userId, id]);
    statements.push({
      sql:
        "INSERT INTO storage_mutations (entity_type, entity_key, mutated_at) VALUES ('match', ?, ?) ON CONFLICT(entity_type, entity_key) DO UPDATE SET mutated_at = excluded.mutated_at",
      args: [key, new Date().toISOString()],
    });
    statements.push(
      record
        ? {
          sql:
            "DELETE FROM storage_tombstones WHERE entity_type = 'match' AND entity_key = ?",
          args: [key],
        }
        : {
          sql:
            "INSERT INTO storage_tombstones (entity_type, entity_key, deleted_at) VALUES ('match', ?, ?) ON CONFLICT(entity_type, entity_key) DO UPDATE SET deleted_at = excluded.deleted_at",
          args: [
            key,
            new Date(state?.stamp.editedAt ?? Date.now()).toISOString(),
          ],
        },
    );
    statements.push("DELETE FROM sync_transaction_guard");
    try {
      await batch(statements);
      return true;
    } catch (error) {
      if (
        !(error instanceof Error) || !error.message.includes("sync_guard_valid")
      ) throw error;
      return false;
    }
  }
  return {
    /**
     * 原子裁决移动或删除；缺失记录不创建虚假的工作区条目。
     * @param {string} id 记录 ID。
     * @param {import("../sync/records.ts").RecordStatus} status 目标状态。
     * @param {import("../sync/protocol.ts").EditStamp} stamp 编辑版本。
     * @return {Promise<import("../sync/records.ts").RecordMerge>} 裁决结果。
     */
    async applyRecord(id, status, stamp) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const before = await read(id);
        const result = mergeRecord(
          id,
          before.record,
          before.state,
          status,
          stamp,
        );
        if (!result.applied || !result.snapshot) return result;
        if (
          await commit(
            id,
            before,
            result.snapshot,
            status === "deleted" ? undefined : result.snapshot.record,
          )
        ) return result;
      }
      throw new Error("Record sync write conflict");
    },
    /**
     * 刷新内容并保留当前管理状态，删除墓碑阻止后台刷新复活记录。
     * @param {MatchRecord} record 新内容。
     */
    async saveRecordContent(record) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const before = await read(record.id);
        const next = projectRecord(record, before.state);
        if (!next) return;
        if (before.record?.notifiedAt) {
          next.notifiedAt = before.record.notifiedAt;
        }
        if (
          await commit(
            record.id,
            before,
            before.state ? { ...before.state, record: next } : undefined,
            next,
          )
        ) return;
      }
      throw new Error("Record content write conflict");
    },
    /**
     * 读取本账号的管理状态和删除墓碑。
     * @return {Promise<RecordSyncSnapshot[]>} 管理状态。
     */
    async readRecordStates() {
      const result = await execute({
        sql: "SELECT value_json FROM sync_records WHERE user_id = ?",
        args: [userId],
      });
      return result.rows.map((row) => JSON.parse(String(row.value_json)));
    },
    /**
     * 复制权威裁决的管理状态，延迟镜像不能覆盖更晚的管理操作。
     * @param {RecordSyncSnapshot} snapshot 权威状态。
     */
    async replaceRecord(snapshot) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const before = await read(snapshot.id);
        if (
          before.state && compareEdits(before.state.stamp, snapshot.stamp) >= 0
        ) return;
        if (
          await commit(
            snapshot.id,
            before,
            snapshot,
            snapshot.status === "deleted" ? undefined : snapshot.record,
          )
        ) return;
      }
      throw new Error("Record replica write conflict");
    },
  };
}
