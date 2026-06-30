import type {
  AppSettings,
  AppState,
  KeywordRule,
  MatchRecord,
  PollingSettings,
  PollSort,
  TopicRule,
} from "../models.ts";

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
        latestMatch: history[0],
        totalMatches: history.length,
      };
    },

    listHistory,

    async hasSeenPost(postId: string): Promise<boolean> {
      const store = await kv();
      const entry = await store.get<boolean>(keys.seen(postId));
      return entry.value === true;
    },

    async saveMatch(record: MatchRecord): Promise<void> {
      const store = await kv();
      await store.atomic()
        .set(keys.match(record.id), record)
        .set(keys.seen(record.post.id), true)
        .commit();
    },

    async setLastPollAt(value: string): Promise<void> {
      const store = await kv();
      await store.set(keys.state, { lastPollAt: value });
    },
  };
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
    polling: normalizePollingSettings(value.polling, defaultSettings.polling),
    themeColor: normalizeThemeColor(value.themeColor, defaultSettings.themeColor),
    topics,
  };
}

function normalizePollingSettings(
  value: Partial<PollingSettings> | undefined,
  fallback: PollingSettings,
): PollingSettings {
  return {
    intervalMinutes: normalizePositiveInteger(value?.intervalMinutes, fallback.intervalMinutes),
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
    return value.commonKeywordRules;
  }

  if (value.keywordRules) {
    return value.keywordRules;
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
    return value.topics;
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
