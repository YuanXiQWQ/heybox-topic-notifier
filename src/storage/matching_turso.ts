/** @file 使用带用户索引的 libSQL 表保存判定缓存、统计和轮询租约。 */
import type { InStatement, ResultSet } from "@libsql/client/web";
import { matchingLeaseMs, type MatchingStore } from "./matching_types.ts";

/**
 * 创建用户隔离的 SQL 判定缓存。
 * @param {(statement: InStatement) => Promise<ResultSet>} execute 执行已初始化的 SQL。
 * @param {string} userId 用户标识。
 * @return {MatchingStore} 缓存操作。
 */
export function createTursoMatchingStore(
  execute: (statement: InStatement) => Promise<ResultSet>,
  userId: string,
): MatchingStore {
  return {
    /**
     * 仅续期尚未过期且令牌相符的轮询租约。
     *
     * @param {string} token 租约令牌。
     * @param {number} now 当前时间。
     * @return {Promise<boolean>} 是否续期成功。
     */
    async renew(token, now) {
      const result = await execute({
        sql:
          "UPDATE matching_runtime SET lease_until = ? WHERE user_id = ? AND lease_token = ? AND lease_until > ?",
        args: [now + matchingLeaseMs, userId, token, now],
      });
      return result.rowsAffected === 1;
    },
    /**
     * 读取独立保存的话题观测数据。
     *
     * @param {string} topicId 话题。
     * @return {Promise<import("./matching_types.ts").TopicActivity | undefined>} 话题观测。
     */
    async activity(topicId) {
      const result = await execute({
        sql:
          "SELECT value_json FROM matching_activity WHERE user_id = ? AND topic_id = ?",
        args: [userId, topicId],
      });
      return result.rows[0]
        ? JSON.parse(String(result.rows[0].value_json))
        : undefined;
    },
    /**
     * 保存话题观测数据以跨轮询估计活跃度。
     *
     * @param {string} topicId 话题。
     * @param {import("./matching_types.ts").TopicActivity} value 观测。
     */
    async saveActivity(topicId, value) {
      await execute({
        sql:
          `INSERT INTO matching_activity (user_id, topic_id, last_seen_at, value_json) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, topic_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, value_json = excluded.value_json`,
        args: [userId, topicId, value.lastObservedAt, JSON.stringify(value)],
      });
    },
    /**
     * 原子获取或续期当前用户的轮询租约。
     *
     * @param {string} token 租约令牌。
     * @param {number} now 当前时间。
     * @return {Promise<boolean>} 是否原子取得或续约。
     */
    async acquire(token, now) {
      const result = await execute({
        sql:
          `INSERT INTO matching_runtime (user_id, lease_token, lease_until) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until
        WHERE matching_runtime.lease_until <= ? OR matching_runtime.lease_token = ?`,
        args: [userId, token, now + matchingLeaseMs, now, token],
      });
      return result.rowsAffected === 1;
    },
    /**
     * 仅释放属于指定令牌的轮询租约。
     *
     * @param {string} token 仅释放属于本次轮询的租约。
     */
    async release(token) {
      await execute({
        sql:
          "UPDATE matching_runtime SET lease_until = 0 WHERE user_id = ? AND lease_token = ?",
        args: [userId, token],
      });
    },
    /**
     * 读取当前用户的持久化运行统计。
     *
     * @return {Promise<MatchingRuntime | undefined>} 统计快照。
     */
    async runtime() {
      const result = await execute({
        sql: "SELECT value_json FROM matching_runtime WHERE user_id = ?",
        args: [userId],
      });
      return result.rows[0]?.value_json
        ? JSON.parse(String(result.rows[0].value_json))
        : undefined;
    },
    /**
     * 保存用量统计与不含帖子列表的话题摘要。
     *
     * @param {MatchingRuntime} value 统计快照。
     */
    async saveRuntime(value) {
      const topics = Object.fromEntries(
        Object.entries(value.topics).map((
          [id, activity],
        ) => [id, { ...activity, previousIds: [] }]),
      );
      await execute({
        sql: `INSERT INTO matching_runtime (user_id, value_json) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json`,
        args: [userId, JSON.stringify({ ...value, topics })],
      });
    },
    /**
     * 读取指定帖子键的判定缓存。
     *
     * @param {string} key 帖子键。
     * @return {Promise<MatchingEntry | undefined>} 判定缓存。
     */
    async get(key) {
      const result = await execute({
        sql:
          "SELECT value_json FROM matching_cache WHERE user_id = ? AND cache_key = ?",
        args: [userId, key],
      });
      return result.rows[0]
        ? JSON.parse(String(result.rows[0].value_json))
        : undefined;
    },
    /**
     * 写入判定缓存并同步待处理索引。
     *
     * @param {MatchingEntry} entry 判定缓存或待处理记录。
     */
    async put(entry) {
      await execute({
        sql:
          `INSERT INTO matching_cache (user_id, cache_key, topic_id, last_seen_at, expires_at, pending, retry_at, value_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, cache_key) DO UPDATE SET
      topic_id = excluded.topic_id, last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at,
      pending = excluded.pending, retry_at = excluded.retry_at, value_json = excluded.value_json`,
        args: [
          userId,
          entry.key,
          entry.topicId,
          entry.lastSeenAt,
          entry.expiresAt,
          entry.pendingPost ? 1 : 0,
          entry.retryAt,
          JSON.stringify(entry),
        ],
      });
    },
    /**
     * 读取到期待处理帖子，并允许冻结至过期时间的兼容条目恢复处理。
     *
     * @param {string} topicId 话题。
     * @param {number} now 当前时间。
     * @return {Promise<MatchingEntry[]>} 到期的待处理记录。
     */
    async pending(topicId, now) {
      const result = await execute({
        sql:
          `SELECT value_json FROM matching_cache WHERE user_id = ? AND topic_id = ? AND pending = 1
        AND (retry_at <= ? OR (retry_at = expires_at AND json_extract(value_json, '$.attempts') >= 3))
        AND expires_at > ? ORDER BY retry_at, last_seen_at LIMIT 20`,
        args: [userId, topicId, now, now],
      });
      return result.rows.map((row) => JSON.parse(String(row.value_json)));
    },
    /**
     * 删除过期或超出容量的条目并返回清理统计。
     *
     * @param {number} now 当前时间。
     * @param {number} limit 数量上限。
     * @return {Promise<{count: number, pending: number, dropped: number}>} 清理统计。
     */
    async prune(now, limit) {
      await execute({
        sql:
          "DELETE FROM matching_activity WHERE user_id = ? AND last_seen_at < ?",
        args: [userId, now - 30 * 86400000],
      });
      const removed = await execute({
        sql:
          `DELETE FROM matching_cache WHERE user_id = ? AND (expires_at <= ? OR cache_key IN
        (SELECT cache_key FROM matching_cache WHERE user_id = ? ORDER BY last_seen_at DESC, cache_key LIMIT -1 OFFSET ?)
        OR cache_key IN (SELECT cache_key FROM matching_cache WHERE user_id = ? AND pending = 1 ORDER BY last_seen_at DESC, cache_key LIMIT -1 OFFSET 200)) RETURNING pending`,
        args: [userId, now, userId, limit, userId],
      });
      const result = await execute({
        sql:
          "SELECT COUNT(*) AS count, COALESCE(SUM(pending), 0) AS pending FROM matching_cache WHERE user_id = ?",
        args: [userId],
      });
      return {
        count: Number(result.rows[0].count),
        pending: Number(result.rows[0].pending),
        dropped: removed.rows.filter((row) => Number(row.pending) === 1).length,
      };
    },
  };
}
