/** @file 将网页设置表单转换为业务设置，并保留未提交的账号配置。 */
import type {
  AppSettings,
  KeywordRule,
  MatchLocation,
  PollIntervalUnit,
  PollSort,
  TopicRule,
} from "../models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";
import {
  canEnableSchedule,
  normalizeSchedule,
} from "../../static/polling-schedule-core.js";
import {
  type MatchingSettings,
  normalizeMatchingSettings,
} from "./matching_settings.ts";

/** 表单解析器接收的所有字段。 */
type SettingsForm = Record<string, FormDataEntryValue | FormDataEntryValue[]>;

/** 可缺省、可多次提交的单个字段。 */
type SettingsField = SettingsForm[string] | undefined;

/**
 * 设置表单中支持的关键词匹配位置。
 */
const matchLocations: MatchLocation[] = [
  "title",
  "body",
  "comments",
  "replies",
];
/**
 * 从表单生成业务设置，忽略设备外观、保留密钥与时段草稿，仅允许完整时段开启。
 *
 * @param {SettingsForm} form 表单数据。
 * @param {AppSettings} currentSettings 当前应用设置。
 * @param {Date} now 当前时间。
 * @return {AppSettings} 新的应用设置。
 */
export function settingsFromForm(
  form: SettingsForm,
  currentSettings: AppSettings,
  now: Date = new Date(),
): AppSettings {
  const activeKeywordTarget =
    String(form.activeKeywordTarget ?? "common").trim() || "common";
  const keywordRules = keywordRulesFromForm(form);
  const commonKeywordRules = activeKeywordTarget === "common"
    ? keywordRules
    : keywordRulesFromJson(form.commonKeywordRulesJson) ??
      currentSettings.commonKeywordRules;
  const topics = topicsFromForm(
    form,
    currentSettings,
    activeKeywordTarget,
    keywordRules,
  );
  const locale = currentSettings.locale;
  const schedule = form.pollSchedule !== undefined
    ? normalizeSchedule(parseScheduleForm(String(form.pollSchedule)), locale)
    : currentSettings.polling.schedule
    ? normalizeSchedule(currentSettings.polling.schedule, locale)
    : undefined;
  if (
    schedule?.enabled && !currentSettings.polling.schedule?.enabled &&
    !canEnableSchedule(schedule)
  ) schedule.enabled = false;
  const pollingEnabled = form.pollEnabled === "on";
  const pollIntervalUnit = normalizePollIntervalUnit(
    form.pollIntervalUnit,
    currentSettings.polling.intervalUnit,
  );
  const pollIntervalValue = normalizePollIntervalValue(
    form.pollIntervalValue,
    pollIntervalUnit,
    currentSettings.polling.intervalValue,
  );
  const pollingIntervalChanged =
    pollIntervalUnit !== currentSettings.polling.intervalUnit ||
    pollIntervalValue !== currentSettings.polling.intervalValue;
  const pollingWasEnabled = currentSettings.polling.enabled;
  const intervalStartedAt = pollingIntervalChanged ||
      (pollingEnabled && !pollingWasEnabled)
    ? now.toISOString()
    : currentSettings.polling.intervalStartedAt;

  return {
    ...currentSettings,
    ...(form.matchingMode !== undefined
      ? { matching: matchingSettingsFromForm(form, currentSettings.matching) }
      : {}),
    activeKeywordTarget,
    commonKeywordRules,
    darkMode: currentSettings.darkMode,
    locale,
    notificationEmailAddress: String(form.notificationEmailAddress ?? "")
      .trim(),
    notificationEmailApiToken: secretValueFromForm(
      form.notificationEmailApiToken,
      currentSettings.notificationEmailApiToken,
    ),
    notificationEmailApiUrl: String(form.notificationEmailApiUrl ?? "").trim(),
    notificationEmailFrom: String(form.notificationEmailFrom ?? "").trim(),
    notificationEmailService: normalizeNotificationEmailService(
      form.notificationEmailService,
    ),
    notificationProvider: normalizeNotificationProvider(
      form.notificationProvider,
    ),
    notificationPushPlusToken: secretValueFromForm(
      form.notificationPushPlusSecret ?? form.notificationPushPlusToken,
      currentSettings.notificationPushPlusToken,
      true,
    ),
    notificationServerChanSendKey: secretValueFromForm(
      form.notificationServerChanSendKey,
      currentSettings.notificationServerChanSendKey,
      true,
    ),
    notificationSmtpHost: String(form.notificationSmtpHost ?? "").trim(),
    notificationSmtpPassword: secretValueFromForm(
      form.notificationSmtpPassword,
      currentSettings.notificationSmtpPassword,
    ),
    notificationSmtpPort: normalizePositiveInteger(
      form.notificationSmtpPort,
      currentSettings.notificationSmtpPort,
    ),
    notificationSmtpSecure: form.notificationSmtpSecure === "on",
    notificationSmtpUsername: String(form.notificationSmtpUsername ?? "")
      .trim(),
    notificationWebhookService: normalizeNotificationWebhookService(
      form.notificationWebhookService,
    ),
    notificationWebhookUrl: secretValueFromForm(
      form.notificationWebhookUrl,
      currentSettings.notificationWebhookUrl,
      true,
    ),
    notificationWxPusherSpt: secretValueFromForm(
      form.notificationWxPusherSpt,
      currentSettings.notificationWxPusherSpt,
      true,
    ),
    polling: {
      ...(schedule ? { schedule } : {}),
      enabled: pollingEnabled,
      intervalStartedAt,
      intervalUnit: pollIntervalUnit,
      intervalValue: pollIntervalValue,
      postLimit: normalizePositiveInteger(
        form.pollPostLimit,
        currentSettings.polling.postLimit,
      ),
      sort: normalizePollSort(form.pollSort, currentSettings.polling.sort),
    },
    themeColor: currentSettings.themeColor,
    topics,
  };
}

/**
 * 从表单读取敏感配置，空提交时保留当前值。
 *
 * @param {SettingsField} value 表单提交值。
 * @param {string} currentValue 当前已保存的敏感配置。
 * @param {boolean} trim 是否在判断前后去除首尾空白。
 * @return {string} 新的敏感配置值。
 */
function secretValueFromForm(
  value: SettingsField,
  currentValue: string,
  trim = false,
): string {
  const submitted = String(value ?? "");
  const normalized = trim ? submitted.trim() : submitted;
  return normalized.length > 0 ? normalized : currentValue;
}

/**
 * 读取匹配表单并限制长度和数值；仅在公司和接口一致时沿用保存的密钥。
 *
 * @param {SettingsForm} form 设置表单。
 * @param {MatchingSettings | undefined} current 当前匹配设置。
 * @return {MatchingSettings} 规范化的匹配设置。
 */
export function matchingSettingsFromForm(
  form: SettingsForm,
  current?: MatchingSettings,
): MatchingSettings {
  const previous = normalizeMatchingSettings(current);
  const target = normalizeMatchingSettings({
    provider: String(
      form.matchingProvider ?? previous.provider,
    ) as MatchingSettings["provider"],
    apiUrl: String(form.matchingApiUrl ?? previous.apiUrl),
  });
  const sameEndpoint = target.provider === previous.provider &&
    target.apiUrl === previous.apiUrl;
  return normalizeMatchingSettings({
    provider: target.provider,
    mode: String(form.matchingMode) as MatchingSettings["mode"],
    apiUrl: target.apiUrl,
    apiKey: secretValueFromForm(
      form.matchingApiKey,
      sameEndpoint ? previous.apiKey : "",
      true,
    ),
    model: String(form.matchingModel ?? previous.model),
    prompt: String(form.matchingPrompt ?? previous.prompt),
    includeComments: form.matchingIncludeComments === "on",
    disableThinking: form.matchingEnableThinking !== "on",
    dailyLimit: Number(form.matchingDailyLimit ?? previous.dailyLimit),
    maxInputChars: Number(form.matchingMaxInputChars ?? previous.maxInputChars),
    maxOutputTokens: Number(
      form.matchingMaxOutputTokens ?? previous.maxOutputTokens,
    ),
    cacheMaxEntries: Number(
      form.matchingCacheMaxEntries ?? previous.cacheMaxEntries,
    ),
    inputPrice: Number(form.matchingInputPrice ?? previous.inputPrice),
    outputPrice: Number(form.matchingOutputPrice ?? previous.outputPrice),
  });
}

/**
 * 从表单字段中解析关键词规则。
 *
 * @param {SettingsForm} form 表单数据。
 * @return {KeywordRule[]} 关键词规则列表。
 */
function keywordRulesFromForm(
  form: SettingsForm,
): KeywordRule[] {
  return formIndexes(form, /^keyword_(\d+)$/).map((index) => {
    const keyword = String(form[`keyword_${index}`] ?? "").trim();
    const locations = matchLocations.filter((location) =>
      form[`keyword_${index}_location_${location}`] === "on"
    );
    const caseSensitive = form[`keyword_${index}_caseSensitive`] === "on";
    const useRegex = form[`keyword_${index}_useRegex`] === "on";

    return { caseSensitive, keyword, locations, useRegex };
  }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
}

/**
 * 从表单字段中解析话题规则。
 *
 * @param {SettingsForm} form 表单数据。
 * @param {AppSettings} currentSettings 当前应用设置。
 * @param {string} activeKeywordTarget 当前正在编辑关键词的目标。
 * @param {KeywordRule[]} activeKeywordRules 当前活动关键词规则。
 * @return {TopicRule[]} 话题规则列表。
 */
function topicsFromForm(
  form: SettingsForm,
  currentSettings: AppSettings,
  activeKeywordTarget: string,
  activeKeywordRules: KeywordRule[],
): TopicRule[] {
  const existingTopics = new Map(
    currentSettings.topics.map((topic) => [topic.id, topic]),
  );

  return formIndexes(form, /^topic_(\d+)_id$/).map((index) => {
    const id = String(form[`topic_${index}_id`] ?? "").trim();
    const existingTopic = existingTopics.get(id);
    const submittedKeywordRules = keywordRulesFromJson(
      form[`topic_${index}_keywordRulesJson`],
    );
    const keywordRules = activeKeywordTarget === id
      ? activeKeywordRules
      : submittedKeywordRules ?? existingTopic?.keywordRules ?? [];

    return {
      enabled: form[`topic_${index}_enabled`] === "on",
      id,
      keywordRules,
      note: String(form[`topic_${index}_note`] ?? "").trim(),
    };
  }).filter((topic) => topic.id.length > 0);
}

/**
 * 从 JSON 字符串中解析关键词规则。
 *
 * @param {SettingsField} value 表单中的 JSON 字段值。
 * @return {KeywordRule[] | undefined} 关键词规则列表，无法解析时返回 undefined。
 */
function keywordRulesFromJson(
  value: SettingsField,
): KeywordRule[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed.map((rule) => {
      const keyword = typeof rule?.keyword === "string"
        ? rule.keyword.trim()
        : "";
      const locations = Array.isArray(rule?.locations)
        ? rule.locations.filter(isMatchLocation)
        : [];
      const caseSensitive = rule?.caseSensitive === true;
      const useRegex = rule?.useRegex === true;

      return { caseSensitive, keyword, locations, useRegex };
    }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
  } catch {
    return undefined;
  }
}

/**
 * 判断值是否为合法匹配位置。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 是合法匹配位置时返回 true。
 */
function isMatchLocation(value: unknown): value is MatchLocation {
  return value === "title" || value === "body" || value === "comments" ||
    value === "replies";
}

/**
 * 从表单字段名中提取索引列表。
 *
 * @param {SettingsForm} form 表单数据。
 * @param {RegExp} pattern 字段名匹配正则。
 * @return {number[]} 按升序排列的索引列表。
 */
function formIndexes(
  form: SettingsForm,
  pattern: RegExp,
): number[] {
  return Array.from(
    new Set(
      Object.keys(form)
        .map((key) => key.match(pattern)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number),
    ),
  ).toSorted((left, right) => left - right);
}

/**
 * 规范化通知渠道。
 *
 * @param {SettingsField} value 表单字段值。
 * @return {AppSettings["notificationProvider"]} 合法通知渠道。
 */
function normalizeNotificationProvider(
  value: SettingsField,
): AppSettings["notificationProvider"] {
  return value === "disabled" || value === "email" || value === "webhook"
    ? value
    : "webhook";
}

/**
 * 规范化正整数表单字段。
 *
 * @param {SettingsField} value 表单字段值。
 * @param {number} fallback 兜底值。
 * @return {number} 合法正整数。
 */
function normalizePositiveInteger(
  value: SettingsField,
  fallback: number,
): number {
  const numericValue = Number(typeof value === "string" ? value : undefined);
  return Number.isInteger(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param {SettingsField} value 表单字段值。
 * @param {PollSort} fallback 兜底排序方式。
 * @return {PollSort} 合法轮询排序方式。
 */
function normalizePollSort(
  value: SettingsField,
  fallback: PollSort,
): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param {SettingsField} value 表单字段值。
 * @param {PollIntervalUnit} fallback 兜底轮询间隔单位。
 * @return {PollIntervalUnit} 合法轮询间隔单位。
 */
function normalizePollIntervalUnit(
  value: SettingsField,
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
 * @param {SettingsField} value 表单字段值。
 * @param {PollIntervalUnit} unit 轮询间隔单位。
 * @param {number} fallback 兜底间隔数值。
 * @return {number} 合法轮询间隔数值。
 */
function normalizePollIntervalValue(
  value: SettingsField,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

/**
 * 解析独立的时段草稿字段，拒绝损坏 JSON 而不影响其它设置。
 * @param {string} value 表单中的时段 JSON。
 * @return {unknown} 配置对象或空配置。
 */
function parseScheduleForm(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
