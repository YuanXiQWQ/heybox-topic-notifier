/**
 * @file 本文件提供基于 Deno KV 的应用数据存储实现。
 */
import type {
  AppSettings,
  AppState,
  DashboardSnapshot,
  KeywordRule,
  MatchRecord,
  PollingSettings,
  PollIntervalUnit,
  PollSort,
  TopicRule,
  UserAccount,
  UserSession,
} from "../models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";

/**
 * Deno KV 中各类数据使用的键构造器。
 */
const keys = {
  account: (id: string) => ["accounts", id] as const,
  accountUsername: (username: string) => ["accountUsernames", normalizeUsername(username)] as const,
  loginFailure: (username: string) => ["loginFailures", normalizeUsername(username)] as const,
  match: (userId: string, id: string) => ["userData", userId, "matches", id] as const,
  session: (tokenHash: string) => ["sessions", tokenHash] as const,
  settings: (userId: string) => ["userData", userId, "settings"] as const,
  state: (userId: string) => ["userData", userId, "state"] as const,
};

/**
 * 登录失败计数及锁定状态。
 */
type LoginFailure = {
  failures: number;
  lockedUntil?: string;
};

/**
 * KV 原子操作需要使用的版本检查项。
 */
type KvCheck = {
  key: Deno.KvKey;
  versionstamp: string | null;
};

/**
 * KV 原子写入操作。
 */
type KvAtomicOperation = {
  check(check: KvCheck): KvAtomicOperation;
  commit(): Promise<{ ok: boolean }>;
  set(key: Deno.KvKey, value: unknown, options?: { expireIn?: number }): KvAtomicOperation;
};

/**
 * 应用存储依赖的 KV 能力集合。
 */
type KvStore = {
  /**
   * 删除指定 KV 键。
   */
  delete(key: Deno.KvKey): Promise<void>;
  /**
   * 读取指定 KV 键。
   */
  get<T>(key: Deno.KvKey): Promise<{ value: T | null; versionstamp: string | null }>;
  /**
   * 按前缀列出 KV 条目。
   */
  list<T>(selector: { prefix: Deno.KvKey }): AsyncIterable<{ value: T }>;
  /**
   * 写入指定 KV 键值。
   */
  set(key: Deno.KvKey, value: unknown, options?: { expireIn?: number }): Promise<unknown>;
  /**
   * 创建原子读写操作。
   *
   * @return 原子读写操作。
   */
  atomic(): KvAtomicOperation;
};

/**
 * KV 存储创建选项。
 */
type KvStorageOptions = {
  openKv?: () => Promise<KvStore>;
};

/**
 * 创建基于 Deno KV 的应用存储。
 *
 * @param defaultSettings 默认应用设置。
 * @param options KV 存储创建选项。
 * @return 应用存储操作集合。
 */
export function createKvStorage(defaultSettings: AppSettings, options: KvStorageOptions = {}) {
  let kvPromise: Promise<KvStore> | undefined;

  /**
   * 获取并缓存 KV 存储实例。
   *
   * @return KV 存储实例。
   */
  async function kv(): Promise<KvStore> {
    kvPromise ??= openKvStore();
    return await kvPromise;
  }

  /**
   * 打开 KV 存储并返回其初始化 Promise。
   *
   * @return KV 存储初始化 Promise。
   */
  function openKvStore(): Promise<KvStore> {
    return options.openKv?.() ?? Deno.openKv();
  }

  /**
   * 列出指定用户的所有命中记录。
   *
   * @param userId 用户 ID。
   * @return 命中记录列表。
   */
  async function listMatchRecords(userId: string): Promise<MatchRecord[]> {
    const store = await kv();
    const records: MatchRecord[] = [];

    for await (
      const entry of store.list<MatchRecord>({ prefix: ["userData", userId, "matches"] })
    ) {
      records.push(entry.value);
    }

    return records;
  }

  /**
   * 创建指定用户作用域下的存储操作集合。
   *
   * @param userId 用户 ID。
   * @return 指定用户的数据存储操作集合。
   */
  function forUser(userId: string) {
    return {
      /**
       * 获取当前用户设置。
       *
       * @return 规范化后的应用设置。
       */
      async getSettings(): Promise<AppSettings> {
        const store = await kv();
        const entry = await store.get<Partial<AppSettings> & LegacySettings>(keys.settings(userId));
        return normalizeSettings(entry.value, defaultSettings);
      },

      /**
       * 保存当前用户设置。
       *
       * @param settings 应用设置。
       * @return 保存完成后的 Promise。
       */
      async saveSettings(settings: AppSettings): Promise<void> {
        const store = await kv();
        await store.set(keys.settings(userId), settings);
      },

      /**
       * 获取当前用户应用状态。
       *
       * @return 应用状态。
       */
      async getAppState(): Promise<AppState> {
        const store = await kv();
        const state = await store.get<AppState>(keys.state(userId));
        const records = await listMatchRecords(userId);

        return {
          lastPollAt: state.value?.lastPollAt,
          latestMatch: latestMatchByMatchedTime(records),
          totalMatches: records.length,
        };
      },

      /**
       * 获取当前用户仪表盘快照。
       *
       * @return 仪表盘快照。
       */
      async getDashboardSnapshot(): Promise<DashboardSnapshot> {
        const store = await kv();
        const settingsEntry = await store.get<Partial<AppSettings> & LegacySettings>(
          keys.settings(userId),
        );
        const stateEntry = await store.get<AppState>(keys.state(userId));
        const records = await listMatchRecords(userId);
        const settings = normalizeSettings(settingsEntry.value, defaultSettings);

        return {
          pendingMatches: pendingFromRecords(records),
          settings,
          state: {
            lastPollAt: stateEntry.value?.lastPollAt,
            latestMatch: latestMatchByMatchedTime(records),
            totalMatches: records.length,
          },
        };
      },

      /**
       * 列出当前用户历史命中记录。
       *
       * @return 按命中时间倒序排列的历史记录。
       */
      async listHistory(): Promise<MatchRecord[]> {
        return historyFromRecords(await listMatchRecords(userId));
      },

      /**
       * 列出当前用户未完成的命中记录。
       *
       * @return 未完成的命中记录列表。
       */
      async listPendingMatches(): Promise<MatchRecord[]> {
        return pendingFromRecords(await listMatchRecords(userId));
      },

      /**
       * 保存当前用户命中记录。
       *
       * @param record 命中记录。
       * @return 保存完成后的 Promise。
       */
      async saveMatch(record: MatchRecord): Promise<void> {
        const store = await kv();
        await store.set(keys.match(userId, record.id), record);
      },

      /**
       * 标记当前用户命中记录已经通知。
       *
       * @param id 命中记录 ID。
       * @param notifiedAt 通知时间。
       * @return 更新完成后的 Promise。
       */
      async markMatchNotified(id: string, notifiedAt: string): Promise<void> {
        const store = await kv();
        const entry = await store.get<MatchRecord>(keys.match(userId, id));
        if (!entry.value) {
          return;
        }

        await store.set(keys.match(userId, id), { ...entry.value, notifiedAt });
      },

      /**
       * 批量完成当前用户命中记录。
       *
       * @param ids 命中记录 ID 列表。
       * @return 更新完成后的 Promise。
       */
      async completeMatches(ids: string[]): Promise<void> {
        const store = await kv();
        const completedAt = new Date().toISOString();
        const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));

        for (const id of uniqueIds) {
          const entry = await store.get<MatchRecord>(keys.match(userId, id));
          if (!entry.value) {
            continue;
          }

          await store.set(keys.match(userId, id), { ...entry.value, completedAt });
        }
      },

      /**
       * 批量删除当前用户命中记录。
       *
       * @param ids 命中记录 ID 列表。
       * @return 删除完成后的 Promise。
       */
      async deleteMatches(ids: string[]): Promise<void> {
        const store = await kv();
        const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));

        for (const id of uniqueIds) {
          await store.delete(keys.match(userId, id));
        }
      },

      /**
       * 保存当前用户最后轮询时间。
       *
       * @param value ISO 格式轮询时间。
       * @return 保存完成后的 Promise。
       */
      async setLastPollAt(value: string): Promise<void> {
        const store = await kv();
        await store.set(keys.state(userId), { lastPollAt: value });
      },
    };
  }

  return {
    forUser,

    /**
     * 按账号 ID 获取账号。
     *
     * @param id 账号 ID。
     * @return 账号信息，不存在时返回 undefined。
     */
    async getAccountById(id: string): Promise<UserAccount | undefined> {
      const store = await kv();
      const entry = await store.get<UserAccount>(keys.account(id));
      return entry.value ?? undefined;
    },

    /**
     * 按用户名获取账号。
     *
     * @param username 用户名。
     * @return 账号信息，不存在时返回 undefined。
     */
    async getAccountByUsername(username: string): Promise<UserAccount | undefined> {
      const store = await kv();
      const accountId = await store.get<string>(keys.accountUsername(username));
      if (!accountId.value) {
        return undefined;
      }

      const account = await store.get<UserAccount>(keys.account(accountId.value));
      return account.value ?? undefined;
    },

    /**
     * 列出所有账号。
     *
     * @return 账号列表。
     */
    async listAccounts(): Promise<UserAccount[]> {
      const store = await kv();
      const accounts: UserAccount[] = [];
      for await (const entry of store.list<UserAccount>({ prefix: ["accounts"] })) {
        accounts.push(entry.value);
      }
      return accounts;
    },

    /**
     * 保存账号信息。
     *
     * @param account 账号信息。
     * @return 保存完成后的 Promise。
     */
    async saveAccount(account: UserAccount): Promise<void> {
      const store = await kv();
      await store.set(keys.account(account.id), account);
      await store.set(keys.accountUsername(account.username), account.id);
    },

    /**
     * 获取指定用户名的登录失败状态。
     *
     * @param username 用户名。
     * @return 登录失败状态，不存在时返回 undefined。
     */
    async getLoginFailure(username: string): Promise<LoginFailure | undefined> {
      const store = await kv();
      const entry = await store.get<LoginFailure>(keys.loginFailure(username));
      return entry.value ?? undefined;
    },

    /**
     * 原子记录一次失败登录，并在达到阈值时锁定账号。
     *
     * @param username 用户名。
     * @param maxFailures 允许的最大连续失败次数。
     * @param lockoutMs 锁定和失败记录的有效时间（毫秒）。
     * @return 更新后的登录失败状态。
     */
    async recordLoginFailure(
      username: string,
      maxFailures: number,
      lockoutMs: number,
    ): Promise<LoginFailure> {
      const store = await kv();
      const key = keys.loginFailure(username);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const entry = await store.get<LoginFailure>(key);
        const previous = entry.value;
        const now = Date.now();
        if (previous?.lockedUntil && Date.parse(previous.lockedUntil) > now) {
          return previous;
        }

        const failures = (previous?.failures ?? 0) + 1;
        const next: LoginFailure = { failures };
        if (failures >= maxFailures) {
          next.lockedUntil = new Date(now + lockoutMs).toISOString();
        }

        const result = await store.atomic()
          .check({ key, versionstamp: entry.versionstamp })
          .set(key, next, { expireIn: lockoutMs })
          .commit();
        if (result.ok) {
          return next;
        }
      }

      throw new Error("Could not record a login failure after concurrent updates.");
    },

    /**
     * 清除指定用户名的登录失败记录。
     *
     * @param username 用户名。
     * @return 清除完成后的 Promise。
     */
    async clearLoginFailures(username: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.loginFailure(username));
    },

    /**
     * 按会话令牌哈希获取用户会话。
     *
     * @param tokenHash 会话令牌哈希。
     * @return 用户会话，不存在时返回 undefined。
     */
    async getSession(tokenHash: string): Promise<UserSession | undefined> {
      const store = await kv();
      const entry = await store.get<UserSession>(keys.session(tokenHash));
      return entry.value ?? undefined;
    },

    /**
     * 保存用户会话。
     *
     * @param session 用户会话。
     * @return 保存完成后的 Promise。
     */
    async saveSession(session: UserSession): Promise<void> {
      const store = await kv();
      await store.set(keys.session(session.tokenHash), session);
    },

    /**
     * 删除用户会话。
     *
     * @param tokenHash 会话令牌哈希。
     * @return 删除完成后的 Promise。
     */
    async deleteSession(tokenHash: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.session(tokenHash));
    },

    /**
     * 获取默认用户设置。
     *
     * @return 默认用户的应用设置。
     */
    async getSettings(): Promise<AppSettings> {
      return await forUser("default").getSettings();
    },

    /**
     * 保存默认用户设置。
     *
     * @param settings 应用设置。
     * @return 保存完成后的 Promise。
     */
    async saveSettings(settings: AppSettings): Promise<void> {
      await forUser("default").saveSettings(settings);
    },

    /**
     * 获取默认用户应用状态。
     *
     * @return 默认用户应用状态。
     */
    async getAppState(): Promise<AppState> {
      return await forUser("default").getAppState();
    },

    /**
     * 获取默认用户仪表盘快照。
     *
     * @return 默认用户仪表盘快照。
     */
    async getDashboardSnapshot(): Promise<DashboardSnapshot> {
      return await forUser("default").getDashboardSnapshot();
    },

    /**
     * 列出默认用户历史命中记录。
     *
     * @return 默认用户历史命中记录。
     */
    async listHistory(): Promise<MatchRecord[]> {
      return await forUser("default").listHistory();
    },

    /**
     * 列出默认用户未完成命中记录。
     *
     * @return 默认用户未完成命中记录。
     */
    async listPendingMatches(): Promise<MatchRecord[]> {
      return await forUser("default").listPendingMatches();
    },

    /**
     * 保存默认用户命中记录。
     *
     * @param record 命中记录。
     * @return 保存完成后的 Promise。
     */
    async saveMatch(record: MatchRecord): Promise<void> {
      await forUser("default").saveMatch(record);
    },

    /**
     * 标记默认用户命中记录已经通知。
     *
     * @param id 命中记录 ID。
     * @param notifiedAt 通知时间。
     * @return 更新完成后的 Promise。
     */
    async markMatchNotified(id: string, notifiedAt: string): Promise<void> {
      await forUser("default").markMatchNotified(id, notifiedAt);
    },

    /**
     * 批量完成默认用户命中记录。
     *
     * @param ids 命中记录 ID 列表。
     * @return 更新完成后的 Promise。
     */
    async completeMatches(ids: string[]): Promise<void> {
      await forUser("default").completeMatches(ids);
    },

    /**
     * 批量删除默认用户命中记录。
     *
     * @param ids 命中记录 ID 列表。
     * @return 删除完成后的 Promise。
     */
    async deleteMatches(ids: string[]): Promise<void> {
      await forUser("default").deleteMatches(ids);
    },

    /**
     * 保存默认用户最后轮询时间。
     *
     * @param value ISO 格式轮询时间。
     * @return 保存完成后的 Promise。
     */
    async setLastPollAt(value: string): Promise<void> {
      await forUser("default").setLastPollAt(value);
    },
  };
}

/**
 * 规范化用户名。
 *
 * @param value 原始用户名。
 * @return 小写并去除首尾空白后的用户名。
 */
function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 将命中记录转换为历史列表顺序。
 *
 * @param records 命中记录列表。
 * @return 按命中时间倒序排列的历史记录。
 */
function historyFromRecords(records: MatchRecord[]): MatchRecord[] {
  return records.toSorted((left, right) => right.matchedAt.localeCompare(left.matchedAt));
}

/**
 * 从命中记录中筛选未完成记录并排序。
 *
 * @param records 命中记录列表。
 * @return 未完成命中记录列表。
 */
function pendingFromRecords(records: MatchRecord[]): MatchRecord[] {
  return records.filter((record) => !record.completedAt)
    .toSorted((left, right) =>
      compareIsoDesc(left.post.publishedAt, right.post.publishedAt) ||
      compareIsoDesc(left.matchedAt, right.matchedAt)
    );
}

/**
 * 按 ISO 时间字符串倒序比较。
 *
 * @param left 左侧时间字符串。
 * @param right 右侧时间字符串。
 * @return 倒序比较结果。
 */
function compareIsoDesc(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return rightTime - leftTime;
  }

  return right.localeCompare(left);
}

/**
 * 按命中时间获取最新命中记录。
 *
 * @param records 命中记录列表。
 * @return 最新命中记录，不存在时返回 undefined。
 */
export function latestMatchByMatchedTime(records: MatchRecord[]): MatchRecord | undefined {
  return records.toSorted((left, right) =>
    compareIsoDesc(left.matchedAt, right.matchedAt) ||
    compareIsoDesc(left.post.publishedAt, right.post.publishedAt)
  )[0];
}

/**
 * 旧版本设置字段结构。
 */
type LegacySettings = {
  commonKeywordRules?: KeywordRule[];
  keywordRules?: KeywordRule[];
  keywords?: string[];
  topicId?: string;
};

/**
 * 将读取到的设置与默认设置合并并规范化。
 *
 * @param value KV 中读取到的设置。
 * @param defaultSettings 默认应用设置。
 * @return 规范化后的应用设置。
 */
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

/**
 * 规范化轮询设置。
 *
 * @param value 待读取的轮询设置。
 * @param fallback 兜底轮询设置。
 * @return 规范化后的轮询设置。
 */
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

/**
 * 规范化正整数。
 *
 * @param value 待规范化值。
 * @param fallback 兜底值。
 * @return 合法正整数。
 */
function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param value 待规范化值。
 * @param fallback 兜底排序方式。
 * @return 合法轮询排序方式。
 */
function normalizePollSort(value: unknown, fallback: PollSort): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime" ? value : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param value 待规范化值。
 * @param fallback 兜底间隔单位。
 * @return 合法轮询间隔单位。
 */
function normalizePollIntervalUnit(value: unknown, fallback: PollIntervalUnit): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" || value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔数值。
 *
 * @param value 待规范化值。
 * @param unit 轮询间隔单位。
 * @param fallback 兜底间隔数值。
 * @return 合法轮询间隔数值。
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
 * @param value 待规范化值。
 * @param fallback 兜底主题颜色。
 * @return 合法的十六进制主题颜色。
 */
function normalizeThemeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

/**
 * 规范化通用关键词规则，兼容旧版本关键词字段。
 *
 * @param value 设置值。
 * @param defaultKeywordRules 默认关键词规则。
 * @return 规范化后的关键词规则列表。
 */
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

/**
 * 规范化话题规则，兼容旧版本单话题字段。
 *
 * @param value 设置值。
 * @param defaultTopics 默认话题规则。
 * @return 规范化后的话题规则列表。
 */
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

/**
 * 规范化关键词规则列表。
 *
 * @param rules 关键词规则列表。
 * @return 规范化后的关键词规则列表。
 */
function normalizeKeywordRuleList(rules: KeywordRule[]): KeywordRule[] {
  return rules.map((rule) => ({
    caseSensitive: rule.caseSensitive === true,
    keyword: rule.keyword,
    locations: rule.locations,
    useRegex: rule.useRegex === true,
  }));
}
