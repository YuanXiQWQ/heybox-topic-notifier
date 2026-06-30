import type { Locale } from "./locales/types.ts";

export type AppSettings = {
  keywords: string[];
  locale: Locale;
  notificationProvider: "disabled" | "email" | "webhook";
  topicId: string;
};

export type TopicPost = {
  excerpt: string;
  id: string;
  publishedAt: string;
  title: string;
  url: string;
};

export type MatchRecord = {
  id: string;
  keyword: string;
  matchedAt: string;
  notifiedAt?: string;
  post: TopicPost;
};

export type AppState = {
  lastPollAt?: string;
  latestMatch?: MatchRecord;
  totalMatches: number;
};
