/**
 * @file 本文件验证关键词匹配器的文本、位置、大小写和正则匹配逻辑。
 */
import { createMatcher } from "./matcher.ts";
import type { AppSettings, TopicPost } from "../models.ts";

/**
 * 匹配器测试使用的应用设置。
 */
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
  notificationEmailAddress: "test@example.com",
  notificationEmailApiToken: "email-api-token",
  notificationEmailApiUrl: "https://example.com/email-api",
  notificationEmailFrom: "from@example.com",
  notificationEmailService: "smtp",
  notificationProvider: "webhook",
  notificationPushPlusToken: "pushplus-test",
  notificationServerChanSendKey: "SCT-test",
  notificationSmtpHost: "smtp.example.com",
  notificationSmtpPassword: "smtp-password",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "smtp-user",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "https://example.com/webhook",
  notificationWxPusherSpt: "SPT-test",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
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

/**
 * 匹配器测试使用的基础帖子。
 */
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

Deno.test("findMatch defaults to case-insensitive matching", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "HELP: controller input is stuck",
  }, [{ keyword: "help", locations: ["title"] }]);

  if (match?.keyword !== "help" || match.location !== "title") {
    throw new Error(`Expected help/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch treats plain keywords as literal contiguous text", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "A.......B",
  }, [{ keyword: "AB", locations: ["title"] }]);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch respects case-sensitive keyword rules", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "HELP: controller input is stuck",
  }, [{ caseSensitive: true, keyword: "help", locations: ["title"] }]);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch supports regex keyword rules", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "Version 1.2.3 crashes after launch",
  }, [{ keyword: String.raw`\d+\.\d+\.\d+`, locations: ["title"], useRegex: true }]);

  if (match?.keyword !== String.raw`\d+\.\d+\.\d+` || match.location !== "title") {
    throw new Error(`Expected regex/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch ignores invalid regex keyword rules", () => {
  const matcher = createMatcher();
  const match = matcher.findMatch({
    ...basePost,
    title: "Version 1.2.3 crashes after launch",
  }, [{ keyword: "[", locations: ["title"], useRegex: true }]);

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
