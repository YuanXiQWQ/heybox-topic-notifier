/**
 * @file 本文件定义话题帖子数据源需要实现的接口。
 */
import type { PollSort, TopicPost } from "../models.ts";

/**
 * 拉取话题帖子列表时使用的选项。
 */
export type TopicListOptions = {
  limit: number;
  sort: PollSort;
};

/**
 * 话题帖子数据源接口。
 */
export type TopicSource = {
  /**
   * 读取整个详情来源的剩余冷却时间；单帖不可用不触发全局冷却。
   * @return {number} 剩余秒数，没有来源级限制时为零。
   */
  detailRetryAfter?(): number;
  /**
   * 获取帖子详情。
   */
  getPostDetails?(post: TopicPost): Promise<TopicPost>;
  /**
   * 拉取指定话题的最新帖子列表。
   */
  listLatestPosts(
    topicId: string,
    options: TopicListOptions,
  ): Promise<TopicPost[]>;
};
