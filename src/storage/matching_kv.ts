/** @file 使用独立 KV 条目保存判定缓存，以原子租约隔离同一用户的并发轮询。 */
import type { KvStore } from "./kv.ts";
import {
  type MatchingEntry,
  matchingLeaseMs,
  type MatchingRuntime,
  type MatchingStore,
  type TopicActivity,
} from "./matching_types.ts";

/**
 * 创建用户隔离的 KV 判定缓存。
 * @param {() => Promise<KvStore>} open 获取 KV 连接。
 * @param {string} userId 用户标识。
 * @return {MatchingStore} 缓存操作。
 */
export function createKvMatchingStore(
  open: () => Promise<KvStore>,
  userId: string,
): MatchingStore {
  const prefix = ["matching", userId, "entries"];
  const leaseKey = ["matching", userId, "lease"];
  const runtimeKey = ["matching", userId, "runtime"];
  const pendingPrefix = ["matching", userId, "pending"];

  /**
   * 读取当前用户的全部缓存条目供周期清理使用。
   *
   * @return {Promise<MatchingEntry[]>} 当前用户的全部缓存，供有界清理使用。
   */
  async function entries(): Promise<MatchingEntry[]> {
    const values: MatchingEntry[] = [];
    for await (const entry of (await open()).list<MatchingEntry>({ prefix })) {
      values.push(entry.value);
    }
    return values;
  }

  return {
    /**
     * 原子续期仍归本次运行所有的有效租约。
     *
     * @param {string} token 租约令牌。
     * @param {number} now 当前时间。
     * @return {Promise<boolean>} 是否续期成功。
     */
    async renew(token, now) {
      const db = await open();
      const current = await db.get<{ token: string; until: number }>(leaseKey);
      if (current.value?.token !== token || current.value.until <= now) {
        return false;
      }
      return (await db.atomic().check({
        key: leaseKey,
        versionstamp: current.versionstamp,
      })
        .set(leaseKey, { token, until: now + matchingLeaseMs }, {
          expireIn: matchingLeaseMs,
        }).commit()).ok;
    },
    /**
     * 读取独立保存的话题观测数据。
     *
     * @param {string} topicId 话题。
     * @return {Promise<TopicActivity | undefined>} 话题观测。
     */
    async activity(topicId) {
      return (await (await open()).get<TopicActivity>([
        "matching",
        userId,
        "activity",
        topicId,
      ])).value ?? undefined;
    },
    /**
     * 保存话题观测数据以跨轮询估计活跃度。
     *
     * @param {string} topicId 话题。
     * @param {TopicActivity} value 观测数据，闲置三十天后过期。
     */
    async saveActivity(topicId, value) {
      await (await open()).set(
        ["matching", userId, "activity", topicId],
        value,
        { expireIn: 30 * 86400000 },
      );
    },
    /**
     * 原子获取或续期当前用户的轮询租约。
     *
     * @param {string} token 租约令牌。
     * @param {number} now 当前时间。
     * @return {Promise<boolean>} 原子取得或续期结果。
     */
    async acquire(token, now) {
      const db = await open();
      const current = await db.get<{ token: string; until: number }>(leaseKey);
      if (
        current.value && current.value.until > now &&
        current.value.token !== token
      ) return false;
      return (await db.atomic().check({
        key: leaseKey,
        versionstamp: current.versionstamp,
      })
        .set(leaseKey, { token, until: now + matchingLeaseMs }, {
          expireIn: matchingLeaseMs,
        }).commit()).ok;
    },
    /**
     * 仅释放属于指定令牌的轮询租约。
     *
     * @param {string} token 仅释放属于本次轮询的租约。
     */
    async release(token) {
      const db = await open();
      const current = await db.get<{ token: string }>(leaseKey);
      if (current.value?.token === token) {
        await db.atomic().check({
          key: leaseKey,
          versionstamp: current.versionstamp,
        }).delete(leaseKey).commit();
      }
    },
    /**
     * 读取当前用户的持久化运行统计。
     *
     * @return {Promise<MatchingRuntime | undefined>} 用量和话题统计。
     */
    async runtime() {
      return (await (await open()).get<MatchingRuntime>(runtimeKey)).value ??
        undefined;
    },
    /**
     * 保存用量统计与不含帖子列表的话题摘要。
     *
     * @param {MatchingRuntime} value 用量和话题统计。
     */
    async saveRuntime(value) {
      const topics = Object.fromEntries(
        Object.entries(value.topics).map((
          [id, activity],
        ) => [id, { ...activity, previousIds: [] }]),
      );
      await (await open()).set(runtimeKey, { ...value, topics });
    },
    /**
     * 读取指定帖子键的判定缓存。
     *
     * @param {string} key 帖子键。
     * @return {Promise<MatchingEntry | undefined>} 判定缓存。
     */
    async get(key) {
      return (await (await open()).get<MatchingEntry>([...prefix, key]))
        .value ?? undefined;
    },
    /**
     * 写入判定缓存并同步待处理索引。
     *
     * @param {MatchingEntry} entry 判定缓存或待处理记录。
     */
    async put(entry) {
      const db = await open();
      const operation = db.atomic().set([...prefix, entry.key], entry);
      if (entry.pendingPost) {
        operation.set([...pendingPrefix, entry.key], entry);
      } else operation.delete([...pendingPrefix, entry.key]);
      await operation.commit();
    },
    /**
     * 读取到期待处理帖子，并允许冻结至过期时间的兼容条目恢复处理。
     *
     * @param {string} topicId 话题。
     * @param {number} now 当前时间。
     * @return {Promise<MatchingEntry[]>} 到期的待处理记录。
     */
    async pending(topicId, now) {
      const candidates: MatchingEntry[] = [];
      for await (
        const item of (await open()).list<MatchingEntry>({
          prefix: pendingPrefix,
        })
      ) candidates.push(item.value);
      return candidates.filter((entry) =>
        entry.topicId === topicId && entry.pendingPost &&
        (entry.retryAt <= now || (entry.attempts >= 3 && entry.retryAt === entry.expiresAt)) && entry.expiresAt > now
      )
        .sort((a, b) => a.retryAt - b.retryAt || a.lastSeenAt - b.lastSeenAt)
        .slice(0, 20);
    },
    /**
     * 删除过期或超出容量的条目并返回清理统计。
     *
     * @param {number} now 当前时间。
     * @param {number} limit 数量上限。
     * @return {Promise<{count: number, pending: number, dropped: number}>} 清理统计。
     */
    async prune(now, limit) {
      const all = (await entries()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      let count = 0, pending = 0, dropped = 0;
      const db = await open();
      for (const entry of all) {
        if (
          entry.expiresAt <= now || count >= limit ||
          (entry.pendingPost && pending >= 200)
        ) {
          await db.delete([...prefix, entry.key]);
          if (entry.pendingPost) await db.delete([...pendingPrefix, entry.key]);
          if (entry.pendingPost) dropped++;
        } else {
          count++;
          if (entry.pendingPost) pending++;
        }
      }
      return { count, pending, dropped };
    },
  };
}
