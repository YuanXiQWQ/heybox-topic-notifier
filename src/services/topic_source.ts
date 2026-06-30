import type { TopicPost } from "../models.ts";

export type TopicSource = {
  listLatestPosts(topicId: string): Promise<TopicPost[]>;
};
