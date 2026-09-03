/**
 * @file 本文件提供基于 Deno KV 的应用数据存储实现。
 */
import type {
  AppSettings,
  AppState,
  AuthenticationEvent,
  AuthenticationEventPurpose,
  AuthIdentity,
  AuthIdentityProvider,
  DashboardSnapshot,
  EmailCredential,
  KeywordRule,
  MatchRecord,
  PasskeyChallengePurpose,
  PasskeyCredential,
  PasswordCredential,
  PendingEmailVerification,
  PendingMfaChallenge,
  PendingPasskeyChallenge,
  PendingRecoveryCodeReveal,
  PollingSettings,
  PollIntervalUnit,
  PollSort,
  TopicRule,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
  UserSession,
} from "../models.ts";
import { normalizeEmailAddress } from "../auth/email.ts";
import {
  normalizePendingMfaChallenge,
  normalizeUserSecuritySettings,
} from "../auth/mfa.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";
import type {
  LoginFailure,
  RateLimitHit,
  Storage,
  UserStorage,
} from "./types.ts";

/**
 * Deno KV 中各类数据使用的键构造器。
 */
const keys = {
  account: (id: string) => ["accounts", id] as const,
  accountUsername: (username: string) =>
    ["accountUsernames", normalizeUsername(username)] as const,
  authenticationEvent: (
    userId: string,
    purpose: AuthenticationEventPurpose,
  ) => ["authenticationEvents", userId, purpose] as const,
  authIdentity: (provider: AuthIdentityProvider, providerUserId: string) =>
    ["authIdentities", provider, providerUserId] as const,
  authIdentityProviderPrefix: (provider: AuthIdentityProvider) =>
    ["authIdentities", provider] as const,
  emailCredential: (userId: string, email: string) =>
    ["emailCredentials", userId, emailKey(email)] as const,
  emailCredentialPrefix: (userId: string) =>
    ["emailCredentials", userId] as const,
  loginFailure: (username: string) =>
    ["loginFailures", normalizeUsername(username)] as const,
  match: (userId: string, id: string) =>
    ["userData", userId, "matches", id] as const,
  passkeyCredential: (userId: string, credentialId: string) =>
    ["passkeyCredentials", userId, credentialId] as const,
  passkeyCredentialIndex: (credentialId: string) =>
    ["passkeyCredentialIndex", credentialId] as const,
  passkeyCredentialPrefix: (userId: string) =>
    ["passkeyCredentials", userId] as const,
  passwordCredential: (userId: string) =>
    ["passwordCredentials", userId] as const,
  pendingEmailVerification: (id: string) =>
    ["pendingEmailVerifications", id] as const,
  pendingMfaChallenge: (id: string) => ["pendingMfaChallenges", id] as const,
  pendingPasskeyChallenge: (id: string) =>
    ["pendingPasskeyChallenges", id] as const,
  pendingRecoveryCodeReveal: (id: string) =>
    ["pendingRecoveryCodeReveals", id] as const,
  rateLimit: (parts: readonly string[]) => ["rateLimits", ...parts] as const,
  session: (tokenHash: string) => ["sessions", tokenHash] as const,
  securitySettings: (userId: string) => ["securitySettings", userId] as const,
  settings: (userId: string) => ["userData", userId, "settings"] as const,
  state: (userId: string) => ["userData", userId, "state"] as const,
  totpCredential: (userId: string, credentialId: string) =>
    ["totpCredentials", userId, credentialId] as const,
  totpCredentialLegacy: (userId: string) =>
    ["totpCredentials", userId] as const,
  totpCredentialPrefix: (userId: string) =>
    ["totpCredentials", userId] as const,
};

/**
 * 频率限制计数记录。
 */
type RateLimitEntry = {
  count: number;
  resetAt: string;
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
  delete(key: Deno.KvKey): KvAtomicOperation;
  set(
    key: Deno.KvKey,
    value: unknown,
    options?: { expireIn?: number },
  ): KvAtomicOperation;
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
  get<T>(
    key: Deno.KvKey,
  ): Promise<{ value: T | null; versionstamp: string | null }>;
  /**
   * 按前缀列出 KV 条目。
   */
  list<T>(selector: { prefix: Deno.KvKey }): AsyncIterable<{ value: T }>;
  /**
   * 写入指定 KV 键值。
   */
  set(
    key: Deno.KvKey,
    value: unknown,
    options?: { expireIn?: number },
  ): Promise<unknown>;
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
export function createKvStorage(
  defaultSettings: AppSettings,
  options: KvStorageOptions = {},
): Storage {
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
      const entry of store.list<MatchRecord>({
        prefix: ["userData", userId, "matches"],
      })
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
  function forUser(userId: string): UserStorage {
    return {
      /**
       * 获取当前用户设置。
       *
       * @return 规范化后的应用设置。
       */
      async getSettings(): Promise<AppSettings> {
        const store = await kv();
        const entry = await store.get<Partial<AppSettings> & LegacySettings>(
          keys.settings(userId),
        );
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
       * 获取当前用户最后轮询时间。
       *
       * @return {Promise<string | undefined>} 最后轮询时间，不存在时返回 undefined。
       */
      async getLastPollAt(): Promise<string | undefined> {
        const store = await kv();
        const state = await store.get<AppState>(keys.state(userId));
        return state.value?.lastPollAt;
      },

      /**
       * 获取当前用户仪表盘快照。
       *
       * @return 仪表盘快照。
       */
      async getDashboardSnapshot(): Promise<DashboardSnapshot> {
        const store = await kv();
        const settingsEntry = await store.get<
          Partial<AppSettings> & LegacySettings
        >(
          keys.settings(userId),
        );
        const stateEntry = await store.get<AppState>(keys.state(userId));
        const records = await listMatchRecords(userId);
        const settings = normalizeSettings(
          settingsEntry.value,
          defaultSettings,
        );

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
        const uniqueIds = Array.from(
          new Set(ids.filter((id) => id.trim().length > 0)),
        );

        for (const id of uniqueIds) {
          const entry = await store.get<MatchRecord>(keys.match(userId, id));
          if (!entry.value) {
            continue;
          }

          await store.set(keys.match(userId, id), {
            ...entry.value,
            completedAt,
          });
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
        const uniqueIds = Array.from(
          new Set(ids.filter((id) => id.trim().length > 0)),
        );

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

  /**
   * 读取指定用户的新旧格式验证器动态码凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<TotpCredential[]>} 验证器动态码凭证列表。
   */
  async function listTotpCredentialsForUser(
    userId: string,
  ): Promise<TotpCredential[]> {
    const store = await kv();
    const credentialsById = new Map<string, TotpCredential>();
    const legacyEntry = await store.get<TotpCredential>(
      keys.totpCredentialLegacy(userId),
    );
    if (legacyEntry.value) {
      const credential = normalizeTotpCredential(legacyEntry.value, userId);
      credentialsById.set(credential.credentialId ?? "legacy", credential);
    }
    for await (
      const entry of store.list<TotpCredential>({
        prefix: keys.totpCredentialPrefix(userId),
      })
    ) {
      const credential = normalizeTotpCredential(entry.value, userId);
      credentialsById.set(credential.credentialId ?? "legacy", credential);
    }
    return Array.from(credentialsById.values()).toSorted((left, right) =>
      left.enabledAt.localeCompare(right.enabledAt) ||
      (left.credentialId ?? "").localeCompare(right.credentialId ?? "")
    );
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
    async getAccountByUsername(
      username: string,
    ): Promise<UserAccount | undefined> {
      const store = await kv();
      const accountId = await store.get<string>(keys.accountUsername(username));
      if (!accountId.value) {
        return undefined;
      }

      const account = await store.get<UserAccount>(
        keys.account(accountId.value),
      );
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
      for await (
        const entry of store.list<UserAccount>({ prefix: ["accounts"] })
      ) {
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
     * 原子创建账号，确保用户名只能被使用一次。
     *
     * @param account 待创建的账号信息。
     * @return 创建成功时返回 true，用户名或账号 ID 已存在时返回 false。
     */
    async createAccount(account: UserAccount): Promise<boolean> {
      const store = await kv();
      const accountKey = keys.account(account.id);
      const usernameKey = keys.accountUsername(account.username);
      const result = await store.atomic()
        .check({ key: accountKey, versionstamp: null })
        .check({ key: usernameKey, versionstamp: null })
        .set(accountKey, account)
        .set(usernameKey, account.id)
        .commit();
      return result.ok;
    },

    async updateAccount(account: UserAccount): Promise<boolean> {
      const store = await kv();
      const accountKey = keys.account(account.id);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const accountEntry = await store.get<UserAccount>(accountKey);
        const currentAccount = accountEntry.value;
        if (!currentAccount) {
          return false;
        }

        const currentUsernameKey = keys.accountUsername(
          currentAccount.username,
        );
        const nextUsernameKey = keys.accountUsername(account.username);
        const usernameChanged = normalizeUsername(currentAccount.username) !==
          normalizeUsername(account.username);
        const currentUsernameEntry = usernameChanged
          ? await store.get<string>(currentUsernameKey)
          : undefined;
        const nextUsernameEntry = usernameChanged
          ? await store.get<string>(nextUsernameKey)
          : undefined;

        if (
          usernameChanged &&
          nextUsernameEntry?.value &&
          nextUsernameEntry.value !== account.id
        ) {
          return false;
        }

        let operation = store.atomic()
          .check({ key: accountKey, versionstamp: accountEntry.versionstamp });

        if (usernameChanged) {
          operation = operation
            .check({
              key: currentUsernameKey,
              versionstamp: currentUsernameEntry?.versionstamp ?? null,
            })
            .check({
              key: nextUsernameKey,
              versionstamp: nextUsernameEntry?.versionstamp ?? null,
            })
            .delete(currentUsernameKey)
            .set(nextUsernameKey, account.id);
        }

        const updateResult = await operation
          .set(accountKey, account)
          .commit();
        if (updateResult.ok) {
          return true;
        }
      }

      throw new Error("Could not update the account after concurrent updates.");
    },

    /**
     * 获取指定用户的安全设置。
     *
     * @param userId 用户 ID。
     * @return 用户安全设置。
     */
    async getUserSecuritySettings(
      userId: string,
    ): Promise<UserSecuritySettings> {
      const store = await kv();
      const entry = await store.get<Partial<UserSecuritySettings>>(
        keys.securitySettings(userId),
      );
      return normalizeUserSecuritySettings(entry.value, userId);
    },

    /**
     * 保存指定用户的安全设置。
     *
     * @param settings 用户安全设置。
     * @return 保存完成后的 Promise。
     */
    async saveUserSecuritySettings(
      settings: UserSecuritySettings,
    ): Promise<void> {
      const normalized = normalizeUserSecuritySettings(
        settings,
        settings.userId,
      );
      const store = await kv();
      await store.set(keys.securitySettings(normalized.userId), normalized);
    },

    /**
     * 获取指定用途的最近认证事件。
     *
     * @param userId 用户 ID。
     * @param purpose 认证用途。
     * @return 最近认证事件，不存在时返回 undefined。
     */
    async getAuthenticationEvent(
      userId: string,
      purpose: AuthenticationEventPurpose,
    ): Promise<AuthenticationEvent | undefined> {
      const store = await kv();
      const entry = await store.get<AuthenticationEvent>(
        keys.authenticationEvent(userId, purpose),
      );
      return entry.value
        ? normalizeAuthenticationEvent(entry.value, userId, purpose)
        : undefined;
    },

    /**
     * 原子读取并删除指定用途的认证事件，确保事件只能消费一次。
     *
     * @param userId 用户 ID。
     * @param purpose 认证用途。
     * @return 成功消费的认证事件，不存在或并发消费失败时返回 undefined。
     */
    async consumeAuthenticationEvent(
      userId: string,
      purpose: AuthenticationEventPurpose,
    ): Promise<AuthenticationEvent | undefined> {
      const store = await kv();
      const key = keys.authenticationEvent(userId, purpose);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const entry = await store.get<AuthenticationEvent>(key);
        if (!entry.value) {
          return undefined;
        }
        const result = await store.atomic()
          .check({ key, versionstamp: entry.versionstamp })
          .delete(key)
          .commit();
        if (result.ok) {
          return normalizeAuthenticationEvent(entry.value, userId, purpose);
        }
      }
      return undefined;
    },

    /**
     * 保存最近认证事件。
     *
     * @param event 认证事件。
     * @return 保存完成后的 Promise。
     */
    async saveAuthenticationEvent(event: AuthenticationEvent): Promise<void> {
      const normalized = normalizeAuthenticationEvent(
        event,
        event.userId,
        event.purpose,
      );
      const store = await kv();
      await store.set(
        keys.authenticationEvent(normalized.userId, normalized.purpose),
        normalized,
      );
    },

    /**
     * 获取指定用户的独立密码凭证。
     *
     * @param userId 用户 ID。
     * @return 密码凭证，不存在时返回 undefined。
     */
    async getPasswordCredential(
      userId: string,
    ): Promise<PasswordCredential | undefined> {
      const store = await kv();
      const entry = await store.get<PasswordCredential>(
        keys.passwordCredential(userId),
      );
      return entry.value ?? undefined;
    },

    /**
     * 保存指定用户的独立密码凭证。
     *
     * @param credential 密码凭证。
     * @return 保存完成后的 Promise。
     */
    async savePasswordCredential(
      credential: PasswordCredential,
    ): Promise<void> {
      const store = await kv();
      await store.set(keys.passwordCredential(credential.userId), credential);
    },

    /**
     * 获取指定用户的验证器动态码凭证。
     *
     * @param userId 用户 ID。
     * @return 验证器动态码凭证，不存在时返回 undefined。
     */
    async getTotpCredential(
      userId: string,
    ): Promise<TotpCredential | undefined> {
      return (await listTotpCredentialsForUser(userId))[0];
    },

    /**
     * 列出指定用户的全部验证器动态码凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<TotpCredential[]>} 验证器动态码凭证列表。
     */
    async listTotpCredentials(userId: string): Promise<TotpCredential[]> {
      return await listTotpCredentialsForUser(userId);
    },

    /**
     * 保存指定用户的验证器动态码凭证。
     *
     * @param credential 验证器动态码凭证。
     * @return 保存完成后的 Promise。
     */
    async saveTotpCredential(credential: TotpCredential): Promise<void> {
      const normalized = normalizeTotpCredential(
        credential,
        credential.userId,
      );
      const store = await kv();
      const credentialKey = normalized.credentialId === "legacy"
        ? keys.totpCredentialLegacy(normalized.userId)
        : keys.totpCredential(normalized.userId, normalized.credentialId!);
      await store.set(credentialKey, normalized);
    },

    /**
     * 删除指定用户的验证器动态码凭证。
     *
     * @param userId 用户 ID。
     * @param credentialId 验证器凭证 ID；省略时删除旧版单凭证记录。
     * @return 删除完成后的 Promise。
     */
    async deleteTotpCredential(
      userId: string,
      credentialId?: string,
    ): Promise<void> {
      const store = await kv();
      await store.delete(
        !credentialId || credentialId === "legacy"
          ? keys.totpCredentialLegacy(userId)
          : keys.totpCredential(userId, credentialId),
      );
    },

    /**
     * 获取指定用户的 Passkey 凭证。
     *
     * @param userId 用户 ID。
     * @param credentialId Passkey 凭证 ID。
     * @return Passkey 凭证，不存在时返回 undefined。
     */
    async getPasskeyCredential(
      userId: string,
      credentialId: string,
    ): Promise<PasskeyCredential | undefined> {
      const store = await kv();
      const entry = await store.get<PasskeyCredential>(
        keys.passkeyCredential(userId, credentialId),
      );
      return entry.value
        ? normalizePasskeyCredential(entry.value, userId)
        : undefined;
    },

    /**
     * 列出指定用户的 Passkey 凭证。
     *
     * @param userId 用户 ID。
     * @return Passkey 凭证列表。
     */
    async listPasskeyCredentials(userId: string): Promise<PasskeyCredential[]> {
      const store = await kv();
      const credentials: PasskeyCredential[] = [];
      for await (
        const entry of store.list<PasskeyCredential>({
          prefix: keys.passkeyCredentialPrefix(userId),
        })
      ) {
        credentials.push(normalizePasskeyCredential(entry.value, userId));
      }
      return credentials.toSorted((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.credentialId.localeCompare(right.credentialId)
      );
    },

    /**
     * 按 Passkey 凭证 ID 反查凭证。
     *
     * @param credentialId Passkey 凭证 ID。
     * @return Passkey 凭证，不存在时返回 undefined。
     */
    async getPasskeyCredentialByCredentialId(
      credentialId: string,
    ): Promise<PasskeyCredential | undefined> {
      const normalizedCredentialId = credentialId.trim();
      if (!normalizedCredentialId) {
        return undefined;
      }

      const store = await kv();
      const indexEntry = await store.get<string>(
        keys.passkeyCredentialIndex(normalizedCredentialId),
      );
      if (!indexEntry.value) {
        return undefined;
      }

      const credentialEntry = await store.get<PasskeyCredential>(
        keys.passkeyCredential(indexEntry.value, normalizedCredentialId),
      );
      return credentialEntry.value
        ? normalizePasskeyCredential(credentialEntry.value, indexEntry.value)
        : undefined;
    },

    /**
     * 保存指定用户的 Passkey 凭证。
     *
     * @param credential Passkey 凭证。
     * @return 保存完成后的 Promise。
     */
    async savePasskeyCredential(
      credential: PasskeyCredential,
    ): Promise<void> {
      const normalized = normalizePasskeyCredential(
        credential,
        credential.userId,
      );
      const store = await kv();
      const indexKey = keys.passkeyCredentialIndex(normalized.credentialId);
      const indexEntry = await store.get<string>(indexKey);
      if (indexEntry.value && indexEntry.value !== normalized.userId) {
        throw new Error("Passkey credential already belongs to another user.");
      }

      const result = await store.atomic()
        .check({ key: indexKey, versionstamp: indexEntry.versionstamp })
        .set(
          keys.passkeyCredential(normalized.userId, normalized.credentialId),
          normalized,
        )
        .set(indexKey, normalized.userId)
        .commit();
      if (!result.ok) {
        throw new Error("Could not save the Passkey credential.");
      }
    },

    /**
     * 删除指定用户的 Passkey 凭证。
     *
     * @param userId 用户 ID。
     * @param credentialId Passkey 凭证 ID。
     * @return 删除完成后的 Promise。
     */
    async deletePasskeyCredential(
      userId: string,
      credentialId: string,
    ): Promise<void> {
      const store = await kv();
      const credentialKey = keys.passkeyCredential(userId, credentialId);
      const indexKey = keys.passkeyCredentialIndex(credentialId);
      const credentialEntry = await store.get<PasskeyCredential>(credentialKey);
      const indexEntry = await store.get<string>(indexKey);

      let operation = store.atomic()
        .check({
          key: credentialKey,
          versionstamp: credentialEntry.versionstamp,
        })
        .delete(credentialKey);
      if (indexEntry.value === userId) {
        operation = operation
          .check({ key: indexKey, versionstamp: indexEntry.versionstamp })
          .delete(indexKey);
      }

      const result = await operation.commit();
      if (!result.ok) {
        throw new Error("Could not delete the Passkey credential.");
      }
    },

    /**
     * 获取外部或邮箱身份绑定。
     *
     * @param provider 身份提供方。
     * @param providerUserId 提供方用户 ID。
     * @return 身份绑定，不存在时返回 undefined。
     */
    async getAuthIdentity(
      provider: AuthIdentityProvider,
      providerUserId: string,
    ): Promise<AuthIdentity | undefined> {
      const store = await kv();
      const entry = await store.get<AuthIdentity>(
        keys.authIdentity(provider, providerUserId),
      );
      return entry.value ?? undefined;
    },

    /**
     * 列出指定用户绑定的外部或邮箱身份。
     *
     * @param provider 身份提供方。
     * @param userId 用户 ID。
     * @return 身份绑定列表。
     */
    async listAuthIdentitiesForUser(
      provider: AuthIdentityProvider,
      userId: string,
    ): Promise<AuthIdentity[]> {
      const store = await kv();
      const entries = store.list<AuthIdentity>({
        prefix: keys.authIdentityProviderPrefix(provider),
      });
      const identities: AuthIdentity[] = [];
      for await (const entry of entries) {
        if (entry.value.userId === userId) {
          identities.push(entry.value);
        }
      }
      return identities.toSorted((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.providerUserId.localeCompare(right.providerUserId)
      );
    },

    /**
     * 保存外部或邮箱身份绑定。
     *
     * @param identity 身份绑定。
     * @return 保存完成后的 Promise。
     */
    async saveAuthIdentity(identity: AuthIdentity): Promise<void> {
      const store = await kv();
      await store.set(
        keys.authIdentity(identity.provider, identity.providerUserId),
        identity,
      );
    },

    /**
     * 删除外部或邮箱身份绑定。
     *
     * @param provider 身份提供方。
     * @param providerUserId 提供方用户 ID。
     * @return 删除完成后的 Promise。
     */
    async deleteAuthIdentity(
      provider: AuthIdentityProvider,
      providerUserId: string,
    ): Promise<void> {
      const store = await kv();
      await store.delete(keys.authIdentity(provider, providerUserId));
    },

    /**
     * 获取指定用户的邮箱凭证。
     *
     * @param userId 用户 ID。
     * @param email 邮箱地址。
     * @return 邮箱凭证，不存在时返回 undefined。
     */
    async getEmailCredential(
      userId: string,
      email: string,
    ): Promise<EmailCredential | undefined> {
      const store = await kv();
      const entry = await store.get<EmailCredential>(
        keys.emailCredential(userId, email),
      );
      return entry.value ?? undefined;
    },

    /**
     * 列出指定用户的邮箱凭证。
     *
     * @param userId 用户 ID。
     * @return 邮箱凭证列表。
     */
    async listEmailCredentials(userId: string): Promise<EmailCredential[]> {
      const store = await kv();
      const credentials: EmailCredential[] = [];
      for await (
        const entry of store.list<EmailCredential>({
          prefix: keys.emailCredentialPrefix(userId),
        })
      ) {
        credentials.push(entry.value);
      }
      return credentials.toSorted((left, right) =>
        left.email.localeCompare(right.email)
      );
    },

    /**
     * 保存指定用户的邮箱凭证。
     *
     * @param credential 邮箱凭证。
     * @return 保存完成后的 Promise。
     */
    async saveEmailCredential(credential: EmailCredential): Promise<void> {
      const normalized = normalizeEmailCredential(credential);
      const store = await kv();
      await store.set(
        keys.emailCredential(normalized.userId, normalized.email),
        normalized,
      );
    },

    /**
     * 删除指定用户的邮箱凭证。
     *
     * @param userId 用户 ID。
     * @param email 邮箱地址。
     * @return 删除完成后的 Promise。
     */
    async deleteEmailCredential(userId: string, email: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.emailCredential(userId, email));
    },

    /**
     * 获取待完成的邮箱验证码挑战。
     *
     * @param id 验证码挑战 ID。
     * @return 待验证挑战，不存在时返回 undefined。
     */
    async getPendingEmailVerification(
      id: string,
    ): Promise<PendingEmailVerification | undefined> {
      const store = await kv();
      const entry = await store.get<PendingEmailVerification>(
        keys.pendingEmailVerification(id),
      );
      return entry.value ?? undefined;
    },

    /**
     * 保存待完成的邮箱验证码挑战。
     *
     * @param verification 待验证挑战。
     * @return 保存完成后的 Promise。
     */
    async savePendingEmailVerification(
      verification: PendingEmailVerification,
    ): Promise<void> {
      const normalized = normalizePendingEmailVerification(verification);
      const store = await kv();
      await store.set(
        keys.pendingEmailVerification(normalized.id),
        normalized,
        expireInFromIso(normalized.expiresAt),
      );
    },

    /**
     * 删除待完成的邮箱验证码挑战。
     *
     * @param id 验证码挑战 ID。
     * @return 删除完成后的 Promise。
     */
    async deletePendingEmailVerification(id: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.pendingEmailVerification(id));
    },

    /**
     * 获取待完成的 MFA challenge。
     *
     * @param id MFA challenge ID。
     * @return 待完成 MFA challenge，不存在时返回 undefined。
     */
    async getPendingMfaChallenge(
      id: string,
    ): Promise<PendingMfaChallenge | undefined> {
      const store = await kv();
      const entry = await store.get<PendingMfaChallenge>(
        keys.pendingMfaChallenge(id),
      );
      return entry.value
        ? normalizePendingMfaChallenge(entry.value)
        : undefined;
    },

    /**
     * 保存待完成的 MFA challenge。
     *
     * @param challenge 待完成 MFA challenge。
     * @return 保存完成后的 Promise。
     */
    async savePendingMfaChallenge(
      challenge: PendingMfaChallenge,
    ): Promise<void> {
      const normalized = normalizePendingMfaChallenge(challenge);
      const store = await kv();
      await store.set(
        keys.pendingMfaChallenge(normalized.id),
        normalized,
        expireInFromIso(normalized.expiresAt),
      );
    },

    /**
     * 删除待完成的 MFA challenge。
     *
     * @param id MFA challenge ID。
     * @return 删除完成后的 Promise。
     */
    async deletePendingMfaChallenge(id: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.pendingMfaChallenge(id));
    },

    /**
     * 获取待完成的 Passkey challenge。
     *
     * @param id Passkey challenge ID。
     * @return 待完成 Passkey challenge，不存在时返回 undefined。
     */
    async getPendingPasskeyChallenge(
      id: string,
    ): Promise<PendingPasskeyChallenge | undefined> {
      const store = await kv();
      const entry = await store.get<PendingPasskeyChallenge>(
        keys.pendingPasskeyChallenge(id),
      );
      return entry.value
        ? normalizePendingPasskeyChallenge(entry.value)
        : undefined;
    },

    /**
     * 保存待完成的 Passkey challenge。
     *
     * @param challenge 待完成 Passkey challenge。
     * @return 保存完成后的 Promise。
     */
    async savePendingPasskeyChallenge(
      challenge: PendingPasskeyChallenge,
    ): Promise<void> {
      const normalized = normalizePendingPasskeyChallenge(challenge);
      const store = await kv();
      await store.set(
        keys.pendingPasskeyChallenge(normalized.id),
        normalized,
        expireInFromIso(normalized.expiresAt),
      );
    },

    /**
     * 删除待完成的 Passkey challenge。
     *
     * @param id Passkey challenge ID。
     * @return 删除完成后的 Promise。
     */
    async deletePendingPasskeyChallenge(id: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.pendingPasskeyChallenge(id));
    },

    /**
     * 获取等待首次展示的恢复码。
     *
     * @param {string} id 展示记录 ID。
     * @return {Promise<PendingRecoveryCodeReveal | undefined>} 待展示恢复码。
     */
    async getPendingRecoveryCodeReveal(
      id: string,
    ): Promise<PendingRecoveryCodeReveal | undefined> {
      const store = await kv();
      const entry = await store.get<PendingRecoveryCodeReveal>(
        keys.pendingRecoveryCodeReveal(id),
      );
      return entry.value ?? undefined;
    },

    /**
     * 短期保存等待首次展示的恢复码。
     *
     * @param {PendingRecoveryCodeReveal} reveal 待展示恢复码。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePendingRecoveryCodeReveal(
      reveal: PendingRecoveryCodeReveal,
    ): Promise<void> {
      const store = await kv();
      await store.set(
        keys.pendingRecoveryCodeReveal(reveal.id),
        reveal,
        expireInFromIso(reveal.expiresAt),
      );
    },

    /**
     * 删除已展示或失效的恢复码记录。
     *
     * @param {string} id 展示记录 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePendingRecoveryCodeReveal(id: string): Promise<void> {
      const store = await kv();
      await store.delete(keys.pendingRecoveryCodeReveal(id));
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

      throw new Error(
        "Could not record a login failure after concurrent updates.",
      );
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
     * 原子记录一次频率限制命中，并返回当前窗口是否仍允许继续操作。
     *
     * @param keyParts 频率限制键片段。
     * @param limit 当前窗口允许的最大次数。
     * @param windowMs 限流窗口毫秒数。
     * @return 频率限制命中结果。
     */
    async recordRateLimitHit(
      keyParts: readonly string[],
      limit: number,
      windowMs: number,
    ): Promise<RateLimitHit> {
      const store = await kv();
      const key = keys.rateLimit(keyParts);
      const normalizedLimit = Math.max(1, Math.floor(limit));
      const normalizedWindowMs = Math.max(1000, Math.floor(windowMs));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = Date.now();
        const entry = await store.get<RateLimitEntry>(key);
        const previous = entry.value;
        const previousResetAt = Date.parse(previous?.resetAt ?? "");
        const previousCount =
          previous && Number.isInteger(previous.count) && previous.count > 0
            ? previous.count
            : 0;
        const hasActiveWindow = Number.isFinite(previousResetAt) &&
          previousResetAt > now;
        const resetAtMs = hasActiveWindow
          ? previousResetAt
          : now + normalizedWindowMs;
        const next: RateLimitEntry = {
          count: hasActiveWindow ? previousCount + 1 : 1,
          resetAt: new Date(resetAtMs).toISOString(),
        };

        const result = await store.atomic()
          .check({ key, versionstamp: entry.versionstamp })
          .set(key, next, { expireIn: Math.max(1000, resetAtMs - now) })
          .commit();
        if (result.ok) {
          return rateLimitHitFromEntry(next, normalizedLimit, now);
        }
      }

      throw new Error(
        "Could not record a rate limit hit after concurrent updates.",
      );
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
     * 获取默认用户最后轮询时间。
     *
     * @return {Promise<string | undefined>} 默认用户最后轮询时间，不存在时返回 undefined。
     */
    async getLastPollAt(): Promise<string | undefined> {
      return await forUser("default").getLastPollAt();
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
 * 将邮箱地址规范化为 KV key 使用的稳定片段。
 *
 * @param value 原始邮箱地址。
 * @return 规范化邮箱地址。
 */
function emailKey(value: string): string {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) {
    throw new Error("Invalid email address.");
  }

  return normalized;
}

/**
 * 规范化邮箱凭证中的邮箱地址。
 *
 * @param credential 邮箱凭证。
 * @return 规范化后的邮箱凭证。
 */
function normalizeEmailCredential(
  credential: EmailCredential,
): EmailCredential {
  return {
    ...credential,
    email: emailKey(credential.email),
  };
}

/**
 * 规范化验证器动态码凭证。
 *
 * @param credential 验证器动态码凭证。
 * @param userId 用户 ID。
 * @return 规范化后的验证器动态码凭证。
 */
function normalizeTotpCredential(
  credential: TotpCredential,
  userId: string,
): TotpCredential {
  return {
    credentialId: typeof credential.credentialId === "string" &&
        credential.credentialId.trim()
      ? credential.credentialId.trim()
      : "legacy",
    enabledAt: typeof credential.enabledAt === "string"
      ? credential.enabledAt
      : "",
    label: typeof credential.label === "string" && credential.label.trim()
      ? credential.label.trim().slice(0, 80)
      : undefined,
    recoveryCodeHashes: Array.isArray(credential.recoveryCodeHashes)
      ? credential.recoveryCodeHashes.filter((value): value is string =>
        typeof value === "string"
      )
      : [],
    secretEncrypted: typeof credential.secretEncrypted === "string"
      ? credential.secretEncrypted
      : "",
    userId,
  };
}

/**
 * 规范化 Passkey 凭证。
 *
 * @param credential Passkey 凭证。
 * @param userId 用户 ID。
 * @return 规范化后的 Passkey 凭证。
 */
function normalizePasskeyCredential(
  credential: PasskeyCredential,
  userId: string,
): PasskeyCredential {
  const transports = Array.isArray(credential.transports)
    ? Array.from(
      new Set(
        credential.transports.filter((value): value is string =>
          typeof value === "string" && value.trim().length > 0
        ).map((value) => value.trim()),
      ),
    )
    : undefined;
  return {
    backedUp: credential.backedUp === true,
    counter: Math.max(0, Math.floor(Number(credential.counter) || 0)),
    createdAt: typeof credential.createdAt === "string"
      ? credential.createdAt
      : "",
    credentialId: typeof credential.credentialId === "string"
      ? credential.credentialId
      : "",
    label: typeof credential.label === "string" &&
        credential.label.trim().length > 0
      ? credential.label.trim()
      : undefined,
    lastUsedAt: typeof credential.lastUsedAt === "string"
      ? credential.lastUsedAt
      : undefined,
    publicKey: typeof credential.publicKey === "string"
      ? credential.publicKey
      : "",
    transports,
    userId,
  };
}

/**
 * 规范化认证事件。
 *
 * @param event 认证事件。
 * @param userId 兜底用户 ID。
 * @param purpose 兜底认证用途。
 * @return 规范化后的认证事件。
 */
function normalizeAuthenticationEvent(
  event: AuthenticationEvent,
  userId: string,
  purpose: AuthenticationEventPurpose,
): AuthenticationEvent {
  return {
    authenticatedAt: typeof event.authenticatedAt === "string"
      ? event.authenticatedAt
      : new Date(0).toISOString(),
    method: isAuthenticationEventMethod(event.method)
      ? event.method
      : "password",
    purpose: isAuthenticationEventPurpose(event.purpose)
      ? event.purpose
      : purpose,
    strength: event.strength === "strong" ? "strong" : "normal",
    userId,
  };
}

/**
 * 判断值是否为认证事件方式。
 *
 * @param value 待判断值。
 * @return 值是认证事件方式时返回 true。
 */
function isAuthenticationEventMethod(
  value: unknown,
): value is AuthenticationEvent["method"] {
  return value === "email_otp" || value === "google" ||
    value === "passkey" || value === "password" ||
    value === "recovery_code" || value === "totp";
}

/**
 * 判断值是否为认证事件用途。
 *
 * @param value 待判断值。
 * @return 值是认证事件用途时返回 true。
 */
function isAuthenticationEventPurpose(
  value: unknown,
): value is AuthenticationEventPurpose {
  return value === "primary_login" || value === "reauth" ||
    value === "recovery_codes" ||
    value === "second_factor";
}

/**
 * 规范化待验证挑战中的邮箱地址。
 *
 * @param verification 待验证挑战。
 * @return 规范化后的待验证挑战。
 */
function normalizePendingEmailVerification(
  verification: PendingEmailVerification,
): PendingEmailVerification {
  return {
    ...verification,
    email: emailKey(verification.email),
  };
}

/**
 * 规范化待完成的 Passkey challenge。
 *
 * @param challenge 待完成 Passkey challenge。
 * @return 规范化后的 Passkey challenge。
 */
function normalizePendingPasskeyChallenge(
  challenge: PendingPasskeyChallenge,
): PendingPasskeyChallenge {
  const allowedCredentialIds = Array.isArray(challenge.allowedCredentialIds)
    ? challenge.allowedCredentialIds
    : [];
  return {
    ...challenge,
    allowedCredentialIds: Array.from(
      new Set(
        allowedCredentialIds.filter((value) =>
          typeof value === "string" && value.trim().length > 0
        ).map((value) => value.trim()),
      ),
    ),
    attempts: Math.max(0, Math.floor(Number(challenge.attempts) || 0)),
    purpose: isPasskeyChallengePurpose(challenge.purpose)
      ? challenge.purpose
      : "primary_login",
  };
}

/**
 * 判断值是否为支持的 Passkey challenge 用途。
 *
 * @param value 待判断值。
 * @return 值是 Passkey challenge 用途时返回 true。
 */
function isPasskeyChallengePurpose(
  value: unknown,
): value is PasskeyChallengePurpose {
  return value === "passkey_registration" || value === "primary_login" ||
    value === "reauth" || value === "second_factor";
}

/**
 * 按 ISO 过期时间生成 KV 自动过期选项。
 *
 * @param expiresAt ISO 格式过期时间。
 * @return KV 自动过期选项，时间无效时返回 undefined。
 */
function expireInFromIso(expiresAt: string): { expireIn: number } | undefined {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return undefined;
  }

  return { expireIn: Math.max(1, expiresAtMs - Date.now()) };
}

/**
 * 将频率限制记录转换为命中结果。
 *
 * @param entry 频率限制计数记录。
 * @param limit 当前窗口允许的最大次数。
 * @param now 当前时间戳毫秒数。
 * @return 频率限制命中结果。
 */
function rateLimitHitFromEntry(
  entry: RateLimitEntry,
  limit: number,
  now: number,
): RateLimitHit {
  const resetAtMs = Date.parse(entry.resetAt);
  return {
    allowed: entry.count <= limit,
    count: entry.count,
    limit,
    resetAt: entry.resetAt,
    retryAfterSeconds: Number.isFinite(resetAtMs)
      ? Math.max(1, Math.ceil((resetAtMs - now) / 1000))
      : 1,
  };
}

/**
 * 将命中记录转换为历史列表顺序。
 *
 * @param records 命中记录列表。
 * @return 按命中时间倒序排列的历史记录。
 */
function historyFromRecords(records: MatchRecord[]): MatchRecord[] {
  return records.toSorted((left, right) =>
    right.matchedAt.localeCompare(left.matchedAt)
  );
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
export function latestMatchByMatchedTime(
  records: MatchRecord[],
): MatchRecord | undefined {
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

  const commonKeywordRules = normalizeKeywordRules(
    value,
    defaultSettings.commonKeywordRules,
  );
  const topics = normalizeTopics(value, defaultSettings.topics);

  return {
    ...defaultSettings,
    ...value,
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
    polling: normalizePollingSettings(value.polling, defaultSettings.polling),
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
  const intervalUnit = normalizePollIntervalUnit(
    value?.intervalUnit,
    fallback.intervalUnit,
  );

  return {
    enabled: typeof value?.enabled === "boolean"
      ? value.enabled
      : fallback.enabled,
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
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param value 待规范化值。
 * @param fallback 兜底排序方式。
 * @return 合法轮询排序方式。
 */
function normalizePollSort(value: unknown, fallback: PollSort): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param value 待规范化值。
 * @param fallback 兜底间隔单位。
 * @return 合法轮询间隔单位。
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
