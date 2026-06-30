import type { Locale } from "./locales/types.ts";

export type MatchLocation = "title" | "body" | "comments" | "replies";

export type KeywordRule = {
  keyword: string;
  locations: MatchLocation[];
};

export type AppSettings = {
  keywordRules: KeywordRule[];
  locale: Locale;
  notificationProvider: "disabled" | "email" | "webhook";
  topicId: string;
};

export type TopicPost = {
  body: string;
  commentReplies: string[];
  comments: string[];
  excerpt: string;
  id: string;
  publishedAt: string;
  title: string;
  url: string;
};

export type MatchRecord = {
  id: string;
  keyword: string;
  location: MatchLocation;
  matchedAt: string;
  notifiedAt?: string;
  post: TopicPost;
};

export type AppState = {
  lastPollAt?: string;
  latestMatch?: MatchRecord;
  totalMatches: number;
};
