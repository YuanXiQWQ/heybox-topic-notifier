/** @file 定义用户隔离的轻量判定缓存、待处理队列、统计与租约契约。 */
import type { MatchResult, TopicPost } from "../models.ts";

/** 成功判定不保存正文；只有尚待处理的条目暂存有长度上限的帖子。 */
export type MatchingEntry = {
  key: string;
  topicId: string;
  postId: string;
  fingerprint: string;
  config: string;
  lastSeenAt: number;
  expiresAt: number;
  evaluatedAt?: number;
  detailCheckedAt?: number;
  detailFingerprint?: string;
  result?: MatchResult | null;
  pendingPost?: TopicPost;
  attempts: number;
  retryAt: number;
};

/** 列表更新速度独立于判定缓存统计，配置失效不计作新帖。 */
export type TopicActivity = {
  signature: string;
  previousIds: string[];
  startedAt: number;
  lastObservedAt: number;
  observedMs: number;
  newPosts: number;
  observations: number;
  checked: number;
  hits: number;
  ttlDays: number;
  ratePerDay: number;
  lastAdjustedAt: number;
  saturated: boolean;
};

/** 当日用量按 UTC 日界线重置，失败请求也占用调用限额。 */
export type MatchingRuntime = {
  day: string;
  calls: number;
  hits: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  unknownUsage: number;
  cacheCount: number;
  pendingCount: number;
  dropped: number;
  lastPrunedAt?: number;
  lastError?: string;
  topics: Record<string, TopicActivity>;
};

/** 缓存适配器由用户作用域创建，所有读写均限定在该用户内。 */
export type MatchingStore = {
  /**
   * 读取独立保存的话题观测数据。
   *
   * @param {string} topicId 话题。
   * @return {Promise<TopicActivity | undefined>} 独立保存的话题观测。
   */
  activity(topicId: string): Promise<TopicActivity | undefined>;
  /**
   * 保存话题观测数据以跨轮询估计活跃度。
   *
   * @param {string} topicId 话题。
   * @param {TopicActivity} value 观测。
   */
  saveActivity(topicId: string, value: TopicActivity): Promise<void>;
  /**
   * 原子获取或续期当前用户的轮询租约。
   *
   * @param {string} token 租约令牌。
   * @param {number} now 当前时间。
   * @return {Promise<boolean>} 是否取得或续约成功。
   */
  acquire(token: string, now: number): Promise<boolean>;
  /**
   * 仅续期仍有效且属于当前运行的租约，避免失去租约后覆盖新用量。
   *
   * @param {string} token 租约令牌。
   * @param {number} now 当前时间。
   * @return {Promise<boolean>} 是否续期成功。
   */
  renew(token: string, now: number): Promise<boolean>;
  /**
   * 仅释放属于指定令牌的轮询租约。
   *
   * @param {string} token 租约令牌。
   */
  release(token: string): Promise<void>;
  /**
   * 读取当前用户的持久化运行统计。
   *
   * @return {Promise<MatchingRuntime | undefined>} 已保存的统计。
   */
  runtime(): Promise<MatchingRuntime | undefined>;
  /**
   * 保存用量统计与不含帖子列表的话题摘要。
   *
   * @param {MatchingRuntime} value 统计快照。
   */
  saveRuntime(value: MatchingRuntime): Promise<void>;
  /**
   * 读取指定帖子键的判定缓存。
   *
   * @param {string} key 帖子缓存键。
   * @return {Promise<MatchingEntry | undefined>} 缓存条目。
   */
  get(key: string): Promise<MatchingEntry | undefined>;
  /**
   * 写入判定缓存并同步待处理索引。
   *
   * @param {MatchingEntry} entry 缓存条目。
   */
  put(entry: MatchingEntry): Promise<void>;
  /**
   * 读取已经到达重试时间的待处理帖子。
   *
   * @param {string} topicId 话题。
   * @param {number} now 当前时间。
   * @return {Promise<MatchingEntry[]>} 最多二十条到期待处理记录。
   */
  pending(topicId: string, now: number): Promise<MatchingEntry[]>;
  /**
   * 删除过期或超出容量的条目并返回清理统计。
   *
   * @param {number} now 当前时间。
   * @param {number} limit 数量上限。
   * @return {Promise<{count: number, pending: number, dropped: number}>} 清理后的数量及丢弃的待处理数量。
   */
  prune(
    now: number,
    limit: number,
  ): Promise<{ count: number; pending: number; dropped: number }>;
};

/** 租约长于单次请求超时，处理期间在请求前续期。 */
export const matchingLeaseMs = 120000;
