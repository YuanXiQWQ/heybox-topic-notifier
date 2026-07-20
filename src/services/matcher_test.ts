/**
 * @file 本文件验证关键词匹配器的文本、位置、大小写和正则匹配逻辑。
 */
import { createMatcher } from "./matcher.ts";
import type { AppSettings, TopicPost } from "../models.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [
    { keyword: "求助", locations: ["title"] },
    { keyword: "打不开", locations: ["comments"] },
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
  topics: [{ enabled: true, id: "12099", keywordRules: [], note: "蔚蓝" }],
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

Deno.test("findMatch returns the first matching keyword and location", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "求助：这里应该怎么走",
  }, settings.commonKeywordRules);

  if (match?.keyword !== "求助" || match.location !== "title") {
    throw new Error(`Expected 求助/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch respects location checkboxes", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    body: "正文里提到打不开，但这个规则只勾选了评论。",
  }, settings.commonKeywordRules);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch defaults to case-insensitive matching", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "HELP: controller input is stuck",
  }, [{ keyword: "help", locations: ["title"] }]);

  if (match?.keyword !== "help" || match.location !== "title") {
    throw new Error(`Expected help/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch treats plain keywords as literal contiguous text", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "A.......B",
  }, [{ keyword: "AB", locations: ["title"] }]);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch respects case-sensitive keyword rules", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "HELP: controller input is stuck",
  }, [{ caseSensitive: true, keyword: "help", locations: ["title"] }]);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch supports regex keyword rules", async () => {
  const keyword = String.raw`\d+\.\d+\.\d+`;
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "Version 1.2.3 crashes after launch",
  }, [{ keyword, locations: ["title"], useRegex: true }]);

  if (match?.keyword !== keyword || match.location !== "title") {
    throw new Error(`Expected regex/title, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch supports negative lookahead regex rules", async () => {
  const keyword = String.raw`怎么(?!(?:这么|感觉))`;
  const matcher = createMatcher();
  const matched = await matcher.findMatch({
    ...basePost,
    title: "这里怎么过去",
  }, [{ keyword, locations: ["title"], useRegex: true }]);
  const excluded = await matcher.findMatch({
    ...basePost,
    title: "怎么感觉这么难",
  }, [{ keyword, locations: ["title"], useRegex: true }]);

  if (matched?.keyword !== keyword || matched.location !== "title") {
    throw new Error(`Expected lookahead/title, got ${JSON.stringify(matched)}`);
  }
  if (excluded !== undefined) {
    throw new Error(`Expected excluded text not to match, got ${JSON.stringify(excluded)}`);
  }
});

Deno.test("findMatch supports backreferences", async () => {
  const keyword = String.raw`(\w+)\s+\1`;
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "help help",
  }, [{ keyword, locations: ["title"], useRegex: true }]);

  if (match?.keyword !== keyword) {
    throw new Error(`Expected backreference match, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch times out catastrophic regex and continues", async () => {
  const matcher = createMatcher();
  const match = await matcher.findMatch({
    ...basePost,
    title: `${"a".repeat(20000)}! safe fallback`,
  }, [
    { keyword: String.raw`^(a+)+$`, locations: ["title"], useRegex: true },
    { keyword: "safe", locations: ["title"] },
  ]);

  if (match?.keyword !== "safe" || match.location !== "title") {
    throw new Error(`Expected safe/title after timeout, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch ignores invalid regex keyword rules", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    title: "Version 1.2.3 crashes after launch",
  }, [{ keyword: "[", locations: ["title"], useRegex: true }]);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch can match comments independently", async () => {
  const match = await createMatcher().findMatch({
    ...basePost,
    comments: ["这里打不开。"],
  }, settings.commonKeywordRules);

  if (match?.keyword !== "打不开" || match.location !== "comments") {
    throw new Error(`Expected 打不开/comments, got ${JSON.stringify(match)}`);
  }
});

Deno.test("findMatch returns undefined when nothing matches", async () => {
  const match = await createMatcher().findMatch(basePost, settings.commonKeywordRules);

  if (match !== undefined) {
    throw new Error(`Expected undefined, got ${JSON.stringify(match)}`);
  }
});
