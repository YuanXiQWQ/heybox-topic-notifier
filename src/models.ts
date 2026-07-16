import type { Locale } from "./locales/types.ts";
import type {
  NotificationEmailService,
  NotificationWebhookService,
} from "./notification_services.ts";

export type MatchLocation = "title" | "body" | "comments" | "replies";

export type KeywordRule = {
  caseSensitive?: boolean;
  keyword: string;
  locations: MatchLocation[];
  useRegex?: boolean;
};

export type TopicRule = {
  enabled: boolean;
  id: string;
  keywordRules: KeywordRule[];
  note: string;
};

export type KeywordTarget = "common" | string;

export type PollSort = "publishTime" | "smart" | "replyTime";

export type PollIntervalUnit = "second" | "minute" | "hour" | "day" | "week" | "month";

export type PollingSettings = {
  enabled: boolean;
  intervalUnit: PollIntervalUnit;
  intervalValue: number;
  postLimit: number;
  sort: PollSort;
};

export type AppSettings = {
  activeKeywordTarget: KeywordTarget;
  commonKeywordRules: KeywordRule[];
  darkMode: boolean;
  locale: Locale;
  notificationEmailAddress: string;
  notificationEmailApiToken: string;
  notificationEmailApiUrl: string;
  notificationEmailFrom: string;
  notificationEmailService: NotificationEmailService;
  notificationProvider: "disabled" | "email" | "webhook";
  notificationPushPlusToken: string;
  notificationServerChanSendKey: string;
  notificationSmtpHost: string;
  notificationSmtpPassword: string;
  notificationSmtpPort: number;
  notificationSmtpSecure: boolean;
  notificationSmtpUsername: string;
  notificationWebhookService: NotificationWebhookService;
  notificationWebhookUrl: string;
  notificationWxPusherSpt: string;
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

export type DashboardSnapshot = {
  pendingMatches: MatchRecord[];
  settings: AppSettings;
  state: AppState;
};
