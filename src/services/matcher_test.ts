import { createMatcher } from "./matcher.ts";
import type { AppSettings, TopicPost } from "../models.ts";

const settings: AppSettings = {
  keywords: ["求助", "打不开"],
  locale: "zh-CN",
  notificationProvider: "webhook",
  topicId: "12099",
};

const basePost: TopicPost = {
  excerpt: "这里是帖子摘要。",
  id: "post-1",
  publishedAt: "2026-06-30T00:00:00.000Z",
  title: "普通帖子",
  url: "https://www.xiaoheihe.cn/app/topic/link/12099",
};

Deno.test("findKeyword returns the first matching keyword", () => {
  const matcher = createMatcher();
  const keyword = matcher.findKeyword({
    ...basePost,
    title: "求助：这里应该怎么走",
  }, settings);

  if (keyword !== "求助") {
    throw new Error(`Expected 求助, got ${keyword}`);
  }
});

Deno.test("findKeyword returns undefined when nothing matches", () => {
  const matcher = createMatcher();
  const keyword = matcher.findKeyword(basePost, settings);

  if (keyword !== undefined) {
    throw new Error(`Expected undefined, got ${keyword}`);
  }
});
