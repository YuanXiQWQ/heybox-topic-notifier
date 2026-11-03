/** @file 将 KV 或 Turso 保存的不同版本设置转换为当前应用设置。 */
import type {
  AppSettings,
  KeywordRule,
  PollingSettings,
  PollIntervalUnit,
  PollSort,
  TopicRule,
} from "../models.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { normalizeSchedule } from "../../static/polling-schedule-core.js";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";

/**
 * 兼容单话题与旧关键词字段的持久化设置。
 */
export type StoredSettings = Partial<AppSettings> & {
  commonKeywordRules?: KeywordRule[];
  keywordRules?: KeywordRule[];
  keywords?: string[];
  topicId?: string;
};

/**
 * 将读取到的设置与默认设置合并并规范化。
 *
 * @param {StoredSettings | null} value 数据库中读取到的设置。
 * @param {AppSettings} defaultSettings 默认应用设置。
 * @return {AppSettings} 合并默认匹配模式与限制后的应用设置。
 */
export function normalizeSettings(
  value: StoredSettings | null,
  defaultSettings: AppSettings,
): AppSettings {
  if (!value) {
    return defaultSettings;
  }

  const commonKeywordRules = normalizeKeywordRules(
    value,
    defaultSettings.commonKeywordRules,
  );
  const topics = normalizeTopics(value, defaultSettings.topics);

  return {
    ...defaultSettings,
    ...value,
    matching: normalizeMatchingSettings(
      value.matching ?? defaultSettings.matching,
    ),
    activeKeywordTarget: value.activeKeywordTarget ??
      defaultSettings.activeKeywordTarget,
    commonKeywordRules,
    darkMode: typeof value.darkMode === "boolean"
      ? value.darkMode
      : defaultSettings.darkMode,
    notificationEmailAddress: typeof value.notificationEmailAddress === "string"
      ? value.notificationEmailAddress
      : defaultSettings.notificationEmailAddress,
    notificationEmailApiToken:
      typeof value.notificationEmailApiToken === "string"
        ? value.notificationEmailApiToken
        : defaultSettings.notificationEmailApiToken,
    notificationEmailApiUrl: typeof value.notificationEmailApiUrl === "string"
      ? value.notificationEmailApiUrl
      : defaultSettings.notificationEmailApiUrl,
    notificationEmailFrom: typeof value.notificationEmailFrom === "string"
      ? value.notificationEmailFrom
      : defaultSettings.notificationEmailFrom,
    notificationEmailService: value.notificationEmailService
      ? normalizeNotificationEmailService(value.notificationEmailService)
      : defaultSettings.notificationEmailService,
    notificationPushPlusToken:
      typeof value.notificationPushPlusToken === "string"
        ? value.notificationPushPlusToken
        : defaultSettings.notificationPushPlusToken,
    notificationServerChanSendKey:
      typeof value.notificationServerChanSendKey === "string"
        ? value.notificationServerChanSendKey
        : defaultSettings.notificationServerChanSendKey,
    notificationSmtpHost: typeof value.notificationSmtpHost === "string"
      ? value.notificationSmtpHost
      : defaultSettings.notificationSmtpHost,
    notificationSmtpPassword: typeof value.notificationSmtpPassword === "string"
      ? value.notificationSmtpPassword
      : defaultSettings.notificationSmtpPassword,
    notificationSmtpPort: normalizePositiveInteger(
      value.notificationSmtpPort,
      defaultSettings.notificationSmtpPort,
    ),
    notificationSmtpSecure: typeof value.notificationSmtpSecure === "boolean"
      ? value.notificationSmtpSecure
      : defaultSettings.notificationSmtpSecure,
    notificationSmtpUsername: typeof value.notificationSmtpUsername === "string"
      ? value.notificationSmtpUsername
      : defaultSettings.notificationSmtpUsername,
    notificationWebhookService: value.notificationWebhookService
      ? normalizeNotificationWebhookService(value.notificationWebhookService)
      : defaultSettings.notificationWebhookService,
    notificationWebhookUrl: typeof value.notificationWebhookUrl === "string"
      ? value.notificationWebhookUrl
      : defaultSettings.notificationWebhookUrl,
    notificationWxPusherSpt: typeof value.notificationWxPusherSpt === "string"
      ? value.notificationWxPusherSpt
      : defaultSettings.notificationWxPusherSpt,
    polling: normalizePollingSettings(
      value.polling,
      defaultSettings.polling,
      value.locale ?? defaultSettings.locale,
    ),
    themeColor: normalizeThemeColor(
      value.themeColor,
      defaultSettings.themeColor,
    ),
    topics,
  };
}

/**
 * 规范化轮询设置。
 *
 * @param {Partial<PollingSettings>|undefined} value 待读取的轮询设置及分时段草稿。
 * @param {PollingSettings} fallback 兜底轮询设置。
 * @param {string} locale 界面语言。
 * @return {PollingSettings} 规范化后的轮询设置。
 */
function normalizePollingSettings(
  value: Partial<PollingSettings> | undefined,
  fallback: PollingSettings,
  locale: string,
): PollingSettings {
  const legacyIntervalMinutes = (value as
    | Partial<PollingSettings> & {
      intervalMinutes?: unknown;
    }
    | undefined)?.intervalMinutes;
  const intervalUnit = normalizePollIntervalUnit(
    value?.intervalUnit,
    fallback.intervalUnit,
  );

  return {
    enabled: typeof value?.enabled === "boolean"
      ? value.enabled
      : fallback.enabled,
    intervalStartedAt: normalizeOptionalTimestamp(
      value?.intervalStartedAt,
      fallback.intervalStartedAt,
    ),
    intervalUnit,
    intervalValue: normalizePollIntervalValue(
      value?.intervalValue ?? legacyIntervalMinutes,
      intervalUnit,
      fallback.intervalValue,
    ),
    ...(value?.schedule
      ? { schedule: normalizeSchedule(value.schedule, locale) }
      : {}),
    postLimit: normalizePositiveInteger(value?.postLimit, fallback.postLimit),
    sort: normalizePollSort(value?.sort, fallback.sort),
  };
}

/**
 * 规范化可选时间戳。
 *
 * @param {unknown} value 待规范化值。
 * @param {string | undefined} fallback 兜底时间戳。
 * @return {string | undefined} 合法 ISO 时间戳，不存在合法值时返回 undefined。
 */
function normalizeOptionalTimestamp(
  value: unknown,
  fallback: string | undefined,
): string | undefined {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }
  return typeof fallback === "string" && Number.isFinite(Date.parse(fallback))
    ? fallback
    : undefined;
}

/**
 * 规范化正整数。
 *
 * @param {unknown} value 待规范化值。
 * @param {number} fallback 兜底值。
 * @return {number} 合法正整数。
 */
function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param {unknown} value 待规范化值。
 * @param {PollSort} fallback 兜底排序方式。
 * @return {PollSort} 合法轮询排序方式。
 */
function normalizePollSort(value: unknown, fallback: PollSort): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param {unknown} value 待规范化值。
 * @param {PollIntervalUnit} fallback 兜底间隔单位。
 * @return {PollIntervalUnit} 合法轮询间隔单位。
 */
function normalizePollIntervalUnit(
  value: unknown,
  fallback: PollIntervalUnit,
): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" ||
      value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔数值。
 *
 * @param {unknown} value 待规范化值。
 * @param {PollIntervalUnit} unit 轮询间隔单位。
 * @param {number} fallback 兜底间隔数值。
 * @return {number} 合法轮询间隔数值。
 */
function normalizePollIntervalValue(
  value: unknown,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

/**
 * 规范化主题颜色。
 *
 * @param {unknown} value 待规范化值。
 * @param {string} fallback 兜底主题颜色。
 * @return {string} 合法的十六进制主题颜色。
 */
function normalizeThemeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

/**
 * 规范化通用关键词规则，兼容旧版本关键词字段。
 *
 * @param {StoredSettings} value 设置值。
 * @param {KeywordRule[]} defaultKeywordRules 默认关键词规则。
 * @return {KeywordRule[]} 规范化后的关键词规则列表。
 */
function normalizeKeywordRules(
  value: StoredSettings,
  defaultKeywordRules: KeywordRule[],
): KeywordRule[] {
  if (value.commonKeywordRules) {
    return normalizeKeywordRuleList(value.commonKeywordRules);
  }

  if (value.keywordRules) {
    return normalizeKeywordRuleList(value.keywordRules);
  }

  if (value.keywords) {
    return value.keywords.map((keyword) => ({
      keyword,
      locations: ["title", "body", "comments", "replies"],
    }));
  }

  return defaultKeywordRules;
}

/**
 * 规范化话题规则，兼容旧版本单话题字段。
 *
 * @param {StoredSettings} value 设置值。
 * @param {TopicRule[]} defaultTopics 默认话题规则。
 * @return {TopicRule[]} 规范化后的话题规则列表。
 */
function normalizeTopics(
  value: StoredSettings,
  defaultTopics: TopicRule[],
): TopicRule[] {
  if (value.topics) {
    return value.topics.map((topic) => ({
      ...topic,
      keywordRules: normalizeKeywordRuleList(topic.keywordRules),
    }));
  }

  if (value.topicId) {
    return [
      {
        enabled: true,
        id: value.topicId,
        keywordRules: [],
        note: value.topicId === "12099" ? "蔚蓝" : "",
      },
    ];
  }

  return defaultTopics;
}

/**
 * 规范化关键词规则列表。
 *
 * @param {KeywordRule[]} rules 关键词规则列表。
 * @return {KeywordRule[]} 规范化后的关键词规则列表。
 */
function normalizeKeywordRuleList(rules: KeywordRule[]): KeywordRule[] {
  return rules.map((rule) => ({
    caseSensitive: rule.caseSensitive === true,
    keyword: rule.keyword,
    locations: rule.locations,
    useRegex: rule.useRegex === true,
  }));
}
