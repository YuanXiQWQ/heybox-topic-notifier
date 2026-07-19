/**
 * @file 本文件定义多语言模块共享的类型。
 */
/**
 * 应用支持的语言标识。
 */
export const locales = [
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "zh-MO",
  "zh-SG",
  "en-US",
  "en-CA",
  "en-GB",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "pt-BR",
  "pt-PT",
  "ru-RU",
  "ar-SA",
  "hi-IN",
  "bn-BD",
  "fa-IR",
  "he-IL",
  "ur-PK",
  "vi-VN",
  "th-TH",
  "id-ID",
  "tr-TR",
] as const;

/**
 * 应用支持的语言标识类型。
 */
export type Locale = typeof locales[number];

/**
 * 支持的语言标识集合。
 */
const localeSet: ReadonlySet<string> = new Set(locales);

/**
 * 使用从右到左书写方向的语言列表。
 */
export const rtlLocales = ["ar-SA", "fa-IR", "he-IL", "ur-PK"] as const;

/**
 * 使用从右到左书写方向的语言集合。
 */
const rtlLocaleSet: ReadonlySet<string> = new Set(rtlLocales);

/**
 * 判断语言值是否为应用支持的语言。
 *
 * @param value 待判断的语言值。
 * @return 是支持语言时返回 true。
 */
export function isLocale(value: string | undefined): value is Locale {
  return typeof value === "string" && localeSet.has(value);
}

/**
 * 判断语言是否使用从右到左书写方向。
 *
 * @param locale 语言标识。
 * @return 使用从右到左书写方向时返回 true。
 */
export function isRtlLocale(locale: Locale): boolean {
  return rtlLocaleSet.has(locale);
}

/**
 * 应用所有可翻译文案字段的结构。
 */
export type Messages = {
  appDescription: string;
  appName: string;
  accountConfirmPassword: string;
  accountCurrentPassword: string;
  accountCancel: string;
  accountEditPassword: string;
  accountEditUsername: string;
  accountNewPassword: string;
  accountNotFound: string;
  accountPasswordConfirmationMismatch: string;
  accountPasswordCurrentInvalid: string;
  accountPasswordMinLength: string;
  accountPasswordUnchanged: string;
  accountPasswordVerified: string;
  accountPasswordVerificationRequired: string;
  accountSave: string;
  accountSettings: string;
  accountUpdated: string;
  accountUsername: string;
  accountUsernameExists: string;
  accountUsernameInvalid: string;
  accountVerifyPassword: string;
  authConfirmPassword: string;
  authCreateAccount: string;
  authExistingAccountLogin: string;
  authInvalidCredentials: string;
  authLanguage: string;
  authLogin: string;
  authLoginRateLimited: string;
  authNavigation: string;
  authPassword: string;
  authPasswordConfirmationMismatch: string;
  authPasswordMinLength: string;
  authRegister: string;
  authUsername: string;
  authUsernameExists: string;
  authUsernameInvalid: string;
  allRows: string;
  autoSaveError: string;
  autoSaveSaved: string;
  autoSaveSaving: string;
  batchOperation: string;
  completeMatch: string;
  commonTopic: string;
  configuredSecretPlaceholder: string;
  configure: string;
  dashboardSubtitle: string;
  dashboardTitle: string;
  darkMode: string;
  deleteMatch: string;
  emptyHistory: string;
  emptyPendingPosts: string;
  filter: string;
  filterAll: string;
  filterCustom: string;
  filterDay: string;
  filterFrom: string;
  filterHour: string;
  filterRange: string;
  filterTo: string;
  filterWeek: string;
  dragRow: string;
  historyTitle: string;
  keywordCaseSensitive: string;
  keywordRegex: string;
  keywords: string;
  lastPoll: string;
  latestMatch: string;
  locale: string;
  matchBody: string;
  matchComments: string;
  matchLocationHeader: string;
  matchReplies: string;
  matchTitle: string;
  matchedKeyword: string;
  navDashboard: string;
  navHistory: string;
  navLogout: string;
  navSettings: string;
  nextPoll: string;
  notificationDisabled: string;
  notificationEmailAddress: string;
  notificationEmail: string;
  notificationEmailApi: string;
  notificationEmailApiToken: string;
  notificationEmailApiUrl: string;
  notificationEmailFrom: string;
  notificationEmailService: string;
  notificationEmailSmtp: string;
  notificationMoreMatches: string;
  notificationBatchTitle: string;
  notificationProvider: string;
  notificationPushPlus: string;
  notificationPushPlusToken: string;
  notificationServerChan: string;
  notificationServerChanSendKey: string;
  notificationSettings: string;
  notificationSmtpHost: string;
  notificationSmtpPassword: string;
  notificationSmtpPort: string;
  notificationSmtpSecure: string;
  notificationSmtpUsername: string;
  notificationSimulatedPostContent: string;
  notificationSimulatedPostTitle: string;
  notificationTestKeyword: string;
  notificationTestPostContent: string;
  notificationTestPostTitle: string;
  notificationTestTitle: string;
  notificationWebhook: string;
  notificationWebhookCustom: string;
  notificationWebhookService: string;
  notificationWebhookUrl: string;
  notificationWxPusher: string;
  notificationWxPusherSpt: string;
  globalSettings: string;
  pageSize: string;
  pollEnabled: string;
  pollInterval: string;
  pollIntervalDay: string;
  pollIntervalHour: string;
  pollIntervalMinute: string;
  pollIntervalMonth: string;
  pollIntervalSecond: string;
  pollIntervalSubMinuteHint: string;
  pollIntervalTooShort: string;
  pollIntervalWeek: string;
  pollingSettings: string;
  pollPostLimit: string;
  pollSort: string;
  pollSortPublishTime: string;
  pollSortReplyTime: string;
  pollSortSmart: string;
  postSettings: string;
  postContent: string;
  postTitle: string;
  publishedAt: string;
  relativeDaysAgo: string;
  relativeHoursAgo: string;
  relativeJustNow: string;
  relativeMinutesAgo: string;
  relativeSecondsAgo: string;
  relativeYesterdayAt: string;
  matchedAt: string;
  runNow: string;
  saveSettings: string;
  selectKeywordToDelete: string;
  selectMatchToComplete: string;
  selectMatchToDelete: string;
  selectTopicToDelete: string;
  settingsTitle: string;
  simulateMatch: string;
  testNotify: string;
  testNotifyBackToSettings: string;
  testNotifyErrorTitle: string;
  testNotifyFailed: string;
  testNotifySending: string;
  testNotifySent: string;
  testNotifyViewError: string;
  theme: string;
  topic: string;
  topicEnabled: string;
  topicKeywords: string;
  topicNote: string;
  topicId: string;
  totalMatches: string;
  pendingPosts: string;
  visitPost: string;
};
