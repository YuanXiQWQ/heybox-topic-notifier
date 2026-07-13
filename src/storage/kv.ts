import type {
  AppSettings,
  AppState,
  KeywordRule,
  MatchRecord,
  PollingSettings,
  PollIntervalUnit,
  PollSort,
  TopicRule,
} from "../models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";

const keys = {
  match: (id: string) => ["matches", id] as const,
  seen: (postId: string) => ["seen", postId] as const,
  settings: ["settings"] as const,
  state: ["state"] as const,
};

export function createKvStorage(defaultSettings: AppSettings) {
  let kvPromise: Promise<Deno.Kv> | undefined;

  async function kv(): Promise<Deno.Kv> {
    kvPromise ??= Deno.openKv();
    return await kvPromise;
  }

  async function listHistory(): Promise<MatchRecord[]> {
    const store = await kv();
    const records: MatchRecord[] = [];

    for await (const entry of store.list<MatchRecord>({ prefix: ["matches"] })) {
      records.push(entry.value);
    }

    return records.toSorted((left, right) => right.matchedAt.localeCompare(left.matchedAt));
  }

  return {
    async getSettings(): Promise<AppSettings> {
      const store = await kv();
      const entry = await store.get<Partial<AppSettings> & LegacySettings>(keys.settings);
      return normalizeSettings(entry.value, defaultSettings);
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const store = await kv();
      await store.set(keys.settings, settings);
    },

    async getAppState(): Promise<AppState> {
      const store = await kv();
      const state = await store.get<AppState>(keys.state);
      const history = await listHistory();

      return {
        lastPollAt: state.value?.lastPollAt,
        latestMatch: latestMatchByMatchedTime(history),
        totalMatches: history.length,
      };
    },

    listHistory,

    async listPendingMatches(): Promise<MatchRecord[]> {
      const history = await listHistory();
      return history.filter((record) => !record.completedAt)
        .toSorted((left, right) =>
          compareIsoDesc(left.post.publishedAt, right.post.publishedAt) ||
          compareIsoDesc(left.matchedAt, right.matchedAt)
        );
    },

    async hasSeenPost(postId: string): Promise<boolean> {
      const store = await kv();
      const entry = await store.get<boolean>(keys.seen(postId));
      return entry.value === true;
    },

    async saveMatch(record: MatchRecord): Promise<void> {
      const store = await kv();
      await store.set(keys.match(record.id), record);
    },

    async markPostSeen(postId: string): Promise<void> {
      const store = await kv();
      await store.set(keys.seen(postId), true);
    },

    async markMatchNotified(id: string, notifiedAt: string): Promise<void> {
      const store = await kv();
      const entry = await store.get<MatchRecord>(keys.match(id));
      if (!entry.value) {
        return;
      }

      await store.set(keys.match(id), { ...entry.value, notifiedAt });
    },

    async completeMatches(ids: string[]): Promise<void> {
      const store = await kv();
      const completedAt = new Date().toISOString();
      const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));

      for (const id of uniqueIds) {
        const entry = await store.get<MatchRecord>(keys.match(id));
        if (!entry.value) {
          continue;
        }

        await store.set(keys.match(id), { ...entry.value, completedAt });
      }
    },

    async deleteMatches(ids: string[]): Promise<void> {
      const store = await kv();
      const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));

      for (const id of uniqueIds) {
        await store.delete(keys.match(id));
      }
    },

    async setLastPollAt(value: string): Promise<void> {
      const store = await kv();
      await store.set(keys.state, { lastPollAt: value });
    },
  };
}

function compareIsoDesc(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return rightTime - leftTime;
  }

  return right.localeCompare(left);
}

export function latestMatchByMatchedTime(records: MatchRecord[]): MatchRecord | undefined {
  return records.toSorted((left, right) =>
    compareIsoDesc(left.matchedAt, right.matchedAt) ||
    compareIsoDesc(left.post.publishedAt, right.post.publishedAt)
  )[0];
}

type LegacySettings = {
  commonKeywordRules?: KeywordRule[];
  keywordRules?: KeywordRule[];
  keywords?: string[];
  topicId?: string;
};

function normalizeSettings(
  value: (Partial<AppSettings> & LegacySettings) | null,
  defaultSettings: AppSettings,
): AppSettings {
  if (!value) {
    return defaultSettings;
  }

  const commonKeywordRules = normalizeKeywordRules(value, defaultSettings.commonKeywordRules);
  const topics = normalizeTopics(value, defaultSettings.topics);

  return {
    ...defaultSettings,
    ...value,
    activeKeywordTarget: value.activeKeywordTarget ?? defaultSettings.activeKeywordTarget,
    commonKeywordRules,
    darkMode: typeof value.darkMode === "boolean" ? value.darkMode : defaultSettings.darkMode,
    notificationEmailAddress: typeof value.notificationEmailAddress === "string"
      ? value.notificationEmailAddress
      : defaultSettings.notificationEmailAddress,
    notificationEmailApiToken: typeof value.notificationEmailApiToken === "string"
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
    notificationPushPlusToken: typeof value.notificationPushPlusToken === "string"
      ? value.notificationPushPlusToken
      : defaultSettings.notificationPushPlusToken,
    notificationServerChanSendKey: typeof value.notificationServerChanSendKey === "string"
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
    polling: normalizePollingSettings(value.polling, defaultSettings.polling),
    themeColor: normalizeThemeColor(value.themeColor, defaultSettings.themeColor),
    topics,
  };
}

function normalizePollingSettings(
  value: Partial<PollingSettings> | undefined,
  fallback: PollingSettings,
): PollingSettings {
  const legacyIntervalMinutes = (value as
    | Partial<PollingSettings> & {
      intervalMinutes?: unknown;
    }
    | undefined)?.intervalMinutes;
  const intervalUnit = normalizePollIntervalUnit(value?.intervalUnit, fallback.intervalUnit);

  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    intervalUnit,
    intervalValue: normalizePollIntervalValue(
      value?.intervalValue ?? legacyIntervalMinutes,
      intervalUnit,
      fallback.intervalValue,
    ),
    postLimit: normalizePositiveInteger(value?.postLimit, fallback.postLimit),
    sort: normalizePollSort(value?.sort, fallback.sort),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizePollSort(value: unknown, fallback: PollSort): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime" ? value : fallback;
}

function normalizePollIntervalUnit(value: unknown, fallback: PollIntervalUnit): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" || value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

function normalizePollIntervalValue(
  value: unknown,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

function normalizeThemeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizeKeywordRules(
  value: LegacySettings,
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

function normalizeTopics(
  value: Partial<AppSettings> & LegacySettings,
  defaultTopics: TopicRule[],
): TopicRule[] {
  if (value.topics && value.topics.length > 0) {
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

function normalizeKeywordRuleList(rules: KeywordRule[]): KeywordRule[] {
  return rules.map((rule) => ({
    caseSensitive: rule.caseSensitive === true,
    keyword: rule.keyword,
    locations: rule.locations,
    useRegex: rule.useRegex === true,
  }));
}
