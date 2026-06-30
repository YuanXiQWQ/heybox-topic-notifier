import { createMatcher } from "./matcher.ts";
import type { AppSettings, TopicPost } from "../models.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [
    {
      keyword: "求助",
      locations: ["title"],
    },
    {
      keyword: "打不开",
      locations: ["comments"],
    },
  ],
  darkMode: false,
  locale: "zh-CN",
  notificationProvider: "webhook",
  polling: {
    intervalMinutes: 1,
    postLimit: 20,
    sort: "publishTime",
  },
  themeColor: "#bd7fff",
  topics: [
    {
      enabled: true,
      id: "12099",
      keywordRules: [],
      note: "蔚蓝",
    },
  ],
};

const basePost: TopicPost = {
  body: "这里是帖子正文。",
  commentReplies: ["这里是评论回复。"],
  comments: ["这里是评论。"],
  excerpt: "这里是帖子摘要。",
  id: "post-1",
  publishedAt: "2026-06-30T00:00:00.000Z",
  title: "普通帖子",
  url: "https://www.xiaoheihe.cn/app/topic/link/12099",
};

Deno.test("findMatch returns the first matching keyword and location", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "求助：这里应该怎么走",
  }, settings.commonKeywordRules);

  if (match?.keyword !== "求助" || match.location !== "title") {
    throw new Error(`Expected 求助/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch respects location checkboxes", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    body: "正文里提到打不开，但这个规则只勾选了评论。",
  }, settings.commonKeywordRules);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch can match comments independently", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    comments: ["这里打不开。"],
  }, settings.commonKeywordRules);

  if (match?.keyword !== "打不开" || match.location !== "comments") {
    throw new Error(`Expected 打不开/comments, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch returns undefined when nothing matches", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch(basePost, settings.commonKeywordRules);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});
