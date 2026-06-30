import type { Locale } from "./locales/types.ts";

export type MatchLocation = "title" | "body" | "comments" | "replies";

export type KeywordRule = {
  keyword: string;
  locations: MatchLocation[];
};

export type TopicRule = {
  enabled: boolean;
  id: string;
  keywordRules: KeywordRule[];
  note: string;
};

export type KeywordTarget = "common" | string;

export type PollSort = "publishTime" | "smart" | "replyTime";

export type PollingSettings = {
  intervalMinutes: number;
  postLimit: number;
  sort: PollSort;
};

export type AppSettings = {
  activeKeywordTarget: KeywordTarget;
  commonKeywordRules: KeywordRule[];
  darkMode: boolean;
  locale: Locale;
  notificationProvider: "disabled" | "email" | "webhook";
  polling: PollingSettings;
  themeColor: string;
  topics: TopicRule[];
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
  completedAt?: string;
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
