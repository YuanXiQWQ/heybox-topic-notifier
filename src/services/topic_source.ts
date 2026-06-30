import type { PollSort, TopicPost } from "../models.ts";

export type TopicListOptions = {
  limit: number;
  sort: PollSort;
};

export type TopicSource = {
  listLatestPosts(topicId: string, options: TopicListOptions): Promise<TopicPost[]>;
};
