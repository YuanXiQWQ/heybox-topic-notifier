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
export type PollIntervalUnit =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

/**
 * 轮询设置。
 */
export type PollingSettings = {
  enabled: boolean;
  intervalStartedAt?: string;
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
 * 认证身份提供方。
 */
export type AuthIdentityProvider = "email" | "google";

/**
 * 主登录方式。
 */
export type PrimaryAuthMethod = "email" | "google" | "passkey" | "password";

/**
 * 二次验证方式。
 */
export type SecondFactorMethod = "email" | "passkey" | "recoveryCode" | "totp";

/**
 * 认证事件方式。
 */
export type AuthenticationEventMethod =
  | "email_otp"
  | "google"
  | "passkey"
  | "password"
  | "recovery_code"
  | "totp";

/**
 * 认证事件用途。
 */
export type AuthenticationEventPurpose =
  | "primary_login"
  | "reauth"
  | "recovery_codes"
  | "second_factor";

/**
 * 邮箱验证码用途。
 */
export type EmailVerificationPurpose =
  | "email_binding"
  | "primary_login"
  | "reauth"
  | "second_factor";

/**
 * Passkey challenge 用途。
 */
export type PasskeyChallengePurpose =
  | "passkey_registration"
  | "primary_login"
  | "reauth"
  | "second_factor";

/**
 * 用户账号信息。
 */
export type UserAccount = {
  authVersion?: number;
  createdAt: string;
  displayName?: string;
  emailVerified?: boolean;
  id: string;
  passwordHash?: string;
  passwordIterations?: number;
  passwordSalt?: string;
  primaryEmail?: string;
  username: string;
};

/**
 * 独立密码凭证。
 */
export type PasswordCredential = {
  passwordHash: string;
  passwordIterations: number;
  passwordSalt: string;
  updatedAt: string;
  userId: string;
};

/**
 * 外部或邮箱身份绑定。
 */
export type AuthIdentity = {
  createdAt: string;
  email?: string;
  emailVerified?: boolean;
  provider: AuthIdentityProvider;
  providerUserId: string;
  userId: string;
};

/**
 * 已绑定邮箱凭证。
 */
export type EmailCredential = {
  createdAt: string;
  email: string;
  lastVerifiedAt?: string;
  userId: string;
  verified: boolean;
};

/**
 * 待完成的邮箱验证码挑战。
 */
export type PendingEmailVerification = {
  attempts: number;
  codeHash: string;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  purpose: EmailVerificationPurpose;
  userId?: string;
};

/**
 * 待完成的 Passkey challenge。
 */
export type PendingPasskeyChallenge = {
  allowedCredentialIds: string[];
  attempts: number;
  challenge: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  purpose: PasskeyChallengePurpose;
  userId?: string;
};

/**
 * Passkey 凭证。
 */
export type PasskeyCredential = {
  backedUp?: boolean;
  counter: number;
  createdAt: string;
  credentialId: string;
  label?: string;
  lastUsedAt?: string;
  publicKey: string;
  transports?: string[];
  userId: string;
};

/**
 * Authenticator 动态验证码凭证。
 */
export type TotpCredential = {
  credentialId?: string;
  enabledAt: string;
  label?: string;
  recoveryCodeHashes: string[];
  secretEncrypted: string;
  userId: string;
};

/**
 * 等待用户首次查看的一次性恢复码。
 */
export type PendingRecoveryCodeReveal = {
  codes: string[];
  expiresAt: string;
  id: string;
  userId: string;
};

/**
 * 用户安全设置。
 */
export type UserSecuritySettings = {
  preferredSecondFactor?: Exclude<SecondFactorMethod, "recoveryCode">;
  twoFactorEnabled: boolean;
  userId: string;
};

/**
 * 待完成的二次验证挑战。
 */
export type PendingMfaChallenge = {
  allowedMethods: SecondFactorMethod[];
  attempts: number;
  createdAt: string;
  expiresAt: string;
  id: string;
  primaryMethod: PrimaryAuthMethod;
  userId: string;
};

/**
 * 认证事件记录。
 */
export type AuthenticationEvent = {
  authenticatedAt: string;
  method: AuthenticationEventMethod;
  purpose: AuthenticationEventPurpose;
  strength: "normal" | "strong";
  userId: string;
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
