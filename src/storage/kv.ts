import type { AppSettings, AppState, MatchRecord } from "../models.ts";

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
      const entry = await store.get<Partial<AppSettings> & { keywords?: string[] }>(keys.settings);
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

function normalizeSettings(
  value: (Partial<AppSettings> & { keywords?: string[] }) | null,
  defaultSettings: AppSettings,
): AppSettings {
  if (!value) {
    return defaultSettings;
  }

  if (!value.keywordRules && value.keywords) {
    return {
      ...defaultSettings,
      ...value,
      keywordRules: value.keywords.map((keyword) => ({
        keyword,
        locations: ["title", "body", "comments", "replies"],
      })),
    };
  }

  return {
    ...defaultSettings,
    ...value,
    keywordRules: value.keywordRules ?? defaultSettings.keywordRules,
  };
}
