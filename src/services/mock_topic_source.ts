import type { TopicPost } from "../models.ts";
import type { TopicSource } from "./topic_source.ts";

export function createMockTopicSource(): TopicSource {
  return {
    async listLatestPosts(_topicId: string): Promise<TopicPost[]> {
      await Promise.resolve();

      return [
        {
          body: "这里试了几个路线都不太行，想问一下这里的路线应该怎么走。",
          commentReplies: ["可以试试从右侧起跳。"],
          comments: ["这个点位确实容易卡住。"],
          excerpt: "想问一下这里的路线应该怎么走。",
          id: "mock-001",
          publishedAt: new Date().toISOString(),
          title: "求助：第九章某处卡住了",
          url: "https://www.xiaoheihe.cn/app/topic/link/12099",
        },
        {
          body: "今天整理了一条新路线，可能能节省几秒。",
          commentReplies: ["谢谢分享。"],
          comments: ["看起来很顺。"],
          excerpt: "没有触发默认关键词，用来验证过滤逻辑。",
          id: "mock-002",
          publishedAt: new Date().toISOString(),
          title: "分享一个新路线",
          url: "https://www.xiaoheihe.cn/app/topic/link/12099",
        },
      ];
    },
  };
}
