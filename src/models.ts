/**
 * @file 本文件定义应用共享的数据模型类型。
 */
import type { Locale } from "./locales/types.ts";
import type {
  NotificationEmailService,
  NotificationWebhookService,
} from "./notification_services.ts";

/**
 * 关键词可匹配的位置。
 */
export type MatchLocation = "title" | "body" | "comments" | "replies";

/**
 * 关键词规则。
 */
export type KeywordRule = {
  caseSensitive?: boolean;
  keyword: string;
  locations: MatchLocation[];
  useRegex?: boolean;
};

/**
 * 小黑盒话题规则。
 */
export type TopicRule = {
  enabled: boolean;
  id: string;
  keywordRules: KeywordRule[];
  note: string;
};

/**
 * 当前正在编辑关键词的目标。
 */
export type KeywordTarget = "common" | string;

/**
 * 话题帖子排序方式。
 */
export type PollSort = "publishTime" | "smart" | "replyTime";

/**
 * 轮询间隔单位。
 */
export type PollIntervalUnit = "second" | "minute" | "hour" | "day" | "week" | "month";

/**
 * 轮询设置。
 */
export type PollingSettings = {
  enabled: boolean;
  intervalUnit: PollIntervalUnit;
  intervalValue: number;
  postLimit: number;
  sort: PollSort;
};

/**
 * 应用设置。
 */
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

/**
 * 小黑盒话题帖子。
 */
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

/**
 * 关键词命中记录。
 */
export type MatchRecord = {
  completedAt?: string;
  id: string;
  keyword: string;
  location: MatchLocation;
  matchedAt: string;
  notifiedAt?: string;
  post: TopicPost;
};

/**
 * 应用运行状态。
 */
export type AppState = {
  lastPollAt?: string;
  latestMatch?: MatchRecord;
  totalMatches: number;
};

/**
 * 仪表盘快照数据。
 */
export type DashboardSnapshot = {
  pendingMatches: MatchRecord[];
  settings: AppSettings;
  state: AppState;
};

/**
 * 用户账号信息。
 */
export type UserAccount = {
  createdAt: string;
  id: string;
  passwordHash: string;
  passwordIterations: number;
  passwordSalt: string;
  username: string;
};

/**
 * 用户登录会话。
 */
export type UserSession = {
  createdAt: string;
  expiresAt: string;
  tokenHash: string;
  userId: string;
  username: string;
};
