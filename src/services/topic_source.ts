import type { PollSort, TopicPost } from "../models.ts";

export type TopicListOptions = {
  limit: number;
  sort: PollSort;
};

export type TopicSource = {
  getPostDetails?(post: TopicPost): Promise<TopicPost>;
  listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]>;
};
