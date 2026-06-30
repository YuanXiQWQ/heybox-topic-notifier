import type { TopicPost } from "../models.ts";

export function createMockTopicSource() {
  return {
    async listLatestPosts(_topicId: string): Promise<TopicPost[]> {
      await Promise.resolve();

      return [
        {
          excerpt: "想问一下这里的路线应该怎么走。",
          id: "mock-001",
          publishedAt: new Date().toISOString(),
          title: "求助：第九章某处卡住了",
          url: "https://www.xiaoheihe.cn/app/topic/link/12099",
        },
        {
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
