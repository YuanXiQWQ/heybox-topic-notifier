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
   * 获取帖子详情。
   */
  getPostDetails?(post: TopicPost): Promise<TopicPost>;
  /**
   * 拉取指定话题的最新帖子列表。
   */
  listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]>;
};
