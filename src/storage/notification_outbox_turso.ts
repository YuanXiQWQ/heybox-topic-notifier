/** @file 以 libSQL 事务维护通知任务及通道租约，确认和重试均校验领取者。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import type { MatchRecord } from "../models.ts";
import type { NotificationChannel, NotificationOutbox } from "./notification_outbox.ts";

/** 一次领取的任务数上限，每条命中包含三个独立通道任务。 */
const claimLimit = 150;
/** 租约覆盖常规外部投递时间；进程中断后其它进程可重新领取。 */
const deliveryLeaseMs = 5 * 60_000;

/**
 * 为新命中创建三个待投递通道，须与记录保存置于同一事务。
 * @param {string} userId 账号 ID。
 * @param {MatchRecord} record 新命中快照。
 * @return {InStatement[]} 原子入队 SQL。
 */
export function notificationEnqueueStatements(userId: string, record: MatchRecord): InStatement[] {
  return (["other", "browser", "native"] as const).map((channel) => ({
    sql: `INSERT OR IGNORE INTO notification_outbox
      (user_id, id, channel, record_json, retry_at, attempts, lease_until)
      VALUES (?, ?, ?, ?, 0, 0, 0)`,
    args: [userId, record.id, channel, JSON.stringify(record)],
  }));
}

/**
 * 创建账号作用域的任务存储。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行器。
 * @param {(statements: InStatement[]) => Promise<ResultSet[]>} batch 原子事务执行器。
 * @param {string} userId 账号 ID。
 * @return {NotificationOutbox} 通道任务存储。
 */
export function createTursoNotificationOutbox(
  execute: (statement: InStatement) => Promise<ResultSet>,
  batch: (statements: InStatement[]) => Promise<ResultSet[]>,
  userId: string,
): NotificationOutbox {
  return {
    /** @param {number} now 当前时间。 @return {Promise<NotificationJob[]>} 原子领取的任务。 */
    async claim(now) {
      const token = crypto.randomUUID();
      const result = await execute({
        sql: `UPDATE notification_outbox SET lease_token = ?, lease_until = ?
          WHERE user_id = ? AND (id, channel) IN (
            SELECT id, channel FROM notification_outbox
            WHERE user_id = ? AND retry_at <= ? AND lease_until <= ?
            ORDER BY retry_at, id, channel LIMIT ?
          ) RETURNING id, channel, record_json, attempts`,
        args: [token, now + deliveryLeaseMs, userId, userId, now, now, claimLimit],
      });
      return result.rows.map((row) => ({ id: String(row.id), channel: String(row.channel) as NotificationChannel, token, attempts: Number(row.attempts), record: JSON.parse(String(row.record_json)) }));
    },
    /** @param {NotificationJob[]} jobs 本领取者的任务。 @param {string | undefined} acceptedAt 受理时间。 */
    async complete(jobs, acceptedAt) {
      if (!jobs.length) return;
      const statements: InStatement[] = [];
      for (const job of jobs) {
        const args = [userId, job.id, job.channel, job.token];
        if (acceptedAt) {
          statements.push({
            sql: `UPDATE matches SET notified_at = COALESCE(notified_at, ?),
              value_json = json_set(value_json, '$.notifiedAt', COALESCE(notified_at, ?))
              WHERE user_id = ? AND id = ? AND EXISTS (
                SELECT 1 FROM notification_outbox WHERE user_id = ? AND id = ? AND channel = ? AND lease_token = ?
              )`,
            args: [acceptedAt, acceptedAt, userId, job.id, ...args],
          });
          statements.push({
            sql: `UPDATE sync_records SET value_json = json_set(value_json, '$.record.notifiedAt', COALESCE(json_extract(value_json, '$.record.notifiedAt'), ?))
              WHERE user_id = ? AND id = ? AND json_type(value_json, '$.record') = 'object' AND EXISTS (
                SELECT 1 FROM notification_outbox WHERE user_id = ? AND id = ? AND channel = ? AND lease_token = ?
              )`,
            args: [acceptedAt, userId, job.id, ...args],
          });
        }
        statements.push({ sql: "DELETE FROM notification_outbox WHERE user_id = ? AND id = ? AND channel = ? AND lease_token = ?", args });
      }
      await batch(statements);
    },
    /** @param {NotificationJob[]} jobs 失败任务。 @param {number} now 失败时间。 */
    async retry(jobs, now) {
      if (!jobs.length) return;
      await batch(jobs.map((job) => ({
        sql: `UPDATE notification_outbox SET attempts = attempts + 1, retry_at = ?, lease_until = 0, lease_token = NULL
          WHERE user_id = ? AND id = ? AND channel = ? AND lease_token = ?`,
        args: [now + Math.min(300_000, 5000 * 2 ** Math.min(job.attempts, 6)), userId, job.id, job.channel, job.token],
      })));
    },
  };
}
