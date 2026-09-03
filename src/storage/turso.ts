/**
 * @file 本文件提供基于 Turso/libSQL 的应用数据存储实现。
 */
import {
  createClient,
  type InArgs,
  type InStatement,
  type ResultSet,
  type Row,
} from "@libsql/client/web";
import { normalizeEmailAddress } from "../auth/email.ts";
import {
  normalizePendingMfaChallenge,
  normalizeUserSecuritySettings,
} from "../auth/mfa.ts";
import type {
  AppSettings,
  AppState,
  AuthenticationEvent,
  AuthenticationEventPurpose,
  AuthIdentity,
  AuthIdentityProvider,
  DashboardSnapshot,
  EmailCredential,
  MatchRecord,
  PasskeyChallengePurpose,
  PasskeyCredential,
  PasswordCredential,
  PendingEmailVerification,
  PendingMfaChallenge,
  PendingPasskeyChallenge,
  PendingRecoveryCodeReveal,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
  UserSession,
} from "../models.ts";
import { latestMatchByMatchedTime, normalizeSettings } from "./kv.ts";
import {
  TURSO_SCHEMA_STATEMENTS,
  TURSO_SCHEMA_VERSION,
} from "./turso_schema.ts";
import type {
  LoginFailure,
  RateLimitHit,
  Storage,
  UserStorage,
} from "./types.ts";

/**
 * Turso 适配器需要使用的最小 libSQL 客户端能力。
 */
export type TursoClient = {
  batch(
    statements: Array<InStatement | [string, InArgs?]>,
    mode?: "deferred" | "read" | "write",
  ): Promise<ResultSet[]>;
  execute(statement: InStatement): Promise<ResultSet>;
};

/**
 * Turso 存储创建选项。
 */
export type TursoStorageOptions = {
  authToken?: string;
  client?: TursoClient;
  url?: string;
  writeMode?: "kv-import" | "live";
};

/**
 * Turso 存储额外提供的迁移保护能力。
 */
export type TursoStorage = Storage & {
  /**
   * 判断 KV 实体是否可以安全回填。
   *
   * @param {string} entityType 实体类型。
   * @param {string} entityKey 实体稳定键。
   * @return {Promise<boolean>} 未实时变更且未删除时返回 true。
   */
  canImportKvEntity(entityType: string, entityKey: string): Promise<boolean>;
};

/**
 * 创建基于 Turso/libSQL 的应用存储。
 *
 * @param {AppSettings} defaultSettings 默认应用设置。
 * @param {TursoStorageOptions} options Turso 连接与测试注入选项。
 * @return {Storage} 应用存储操作集合。
 */
export function createTursoStorage(
  defaultSettings: AppSettings,
  options: TursoStorageOptions = {},
): TursoStorage {
  const client = options.client ?? createRemoteClient(options);
  const writeMode = options.writeMode ?? "live";
  let readyPromise: Promise<void> | undefined;

  /**
   * 确保数据库已经应用当前版本 schema。
   *
   * @return {Promise<void>} schema 就绪后的 Promise。
   */
  async function ready(): Promise<void> {
    readyPromise ??= ensureTursoSchema(client);
    await readyPromise;
  }

  /**
   * 执行单条 SQL。
   *
   * @param {InStatement} statement SQL 语句及参数。
   * @return {Promise<ResultSet>} SQL 结果。
   */
  async function execute(statement: InStatement): Promise<ResultSet> {
    await ready();
    return await client.execute(statement);
  }

  /**
   * 以事务批量执行 SQL。
   *
   * @param {Array<InStatement | [string, InArgs?]>} statements SQL 语句列表。
   * @return {Promise<ResultSet[]>} 各语句执行结果。
   */
  async function batch(
    statements: Array<InStatement | [string, InArgs?]>,
  ): Promise<ResultSet[]> {
    await ready();
    return await client.batch(statements, "write");
  }

  /**
   * 写入业务数据，并清除该实体以前的删除墓碑。
   *
   * @param {string} entityType 实体类型。
   * @param {string} entityKey 实体稳定键。
   * @param {InStatement} statement 数据写入语句。
   * @return {Promise<ResultSet>} 数据写入结果。
   */
  async function writeEntity(
    entityType: string,
    entityKey: string,
    statement: InStatement,
  ): Promise<ResultSet> {
    if (writeMode === "kv-import") {
      try {
        const results = await batch([
          "DELETE FROM storage_import_guard",
          claimKvImportStatement(entityType, entityKey),
          `INSERT INTO storage_import_guard (id)
            VALUES (CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
          statement,
          "DELETE FROM storage_import_guard",
        ]);
        return results[3];
      } catch (error) {
        if (isImportGuardConstraintError(error)) {
          throw kvImportBlockedError();
        }
        throw error;
      }
    }
    const results = await batch([
      statement,
      mutationStatement(entityType, entityKey, true),
      {
        sql: `DELETE FROM storage_tombstones
          WHERE entity_type = ? AND entity_key = ?`,
        args: [entityType, entityKey],
      },
    ]);
    return results[0];
  }

  /**
   * 删除业务数据并记录墓碑，防止后续旧数据回填导致记录复活。
   *
   * @param {string} entityType 实体类型。
   * @param {string} entityKey 实体稳定键。
   * @param {InStatement} statement 数据删除语句。
   * @return {Promise<void>} 删除和墓碑写入完成后的 Promise。
   */
  async function deleteEntity(
    entityType: string,
    entityKey: string,
    statement: InStatement,
  ): Promise<void> {
    await batch([
      statement,
      {
        sql: `INSERT INTO storage_tombstones
            (entity_type, entity_key, deleted_at)
          VALUES (?, ?, ?)
          ON CONFLICT(entity_type, entity_key) DO UPDATE SET
            deleted_at = excluded.deleted_at`,
        args: [entityType, entityKey, new Date().toISOString()],
      },
      mutationStatement(entityType, entityKey),
    ]);
  }

  /**
   * 读取指定用户的命中记录。
   *
   * @param {string} userId 用户 ID。
   * @param {"history" | "pending" | "all"} mode 查询模式。
   * @return {Promise<MatchRecord[]>} 命中记录列表。
   */
  async function listMatches(
    userId: string,
    mode: "history" | "pending" | "all",
  ): Promise<MatchRecord[]> {
    const where = mode === "pending" ? " AND completed_at IS NULL" : "";
    const order = mode === "pending"
      ? "post_published_at DESC, matched_at DESC"
      : "matched_at DESC";
    const result = await execute({
      sql: `SELECT value_json FROM matches
        WHERE user_id = ?${where}
        ORDER BY ${order}`,
      args: [userId],
    });
    return result.rows.map((row) => parseJsonRow<MatchRecord>(row));
  }

  /**
   * 创建指定用户作用域下的存储操作集合。
   *
   * @param {string} userId 用户 ID。
   * @return {UserStorage} 指定用户的数据存储操作集合。
   */
  function forUser(userId: string): UserStorage {
    return {
      async getSettings(): Promise<AppSettings> {
        const result = await execute({
          sql: "SELECT value_json FROM user_settings WHERE user_id = ?",
          args: [userId],
        });
        return normalizeSettings(
          result.rows[0]
            ? parseJsonRow<Partial<AppSettings>>(result.rows[0])
            : null,
          defaultSettings,
        );
      },
      async saveSettings(settings: AppSettings): Promise<void> {
        await writeEntity("settings", userId, {
          sql: `INSERT INTO user_settings (user_id, value_json)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json`,
          args: [userId, JSON.stringify(settings)],
        });
      },
      async getAppState(): Promise<AppState> {
        const [stateResult, matchResult] = await Promise.all([
          execute({
            sql: "SELECT last_poll_at FROM app_states WHERE user_id = ?",
            args: [userId],
          }),
          execute({
            sql: `SELECT value_json, COUNT(*) OVER () AS total_matches
              FROM matches
              WHERE user_id = ?
              ORDER BY matched_at DESC, post_published_at DESC
              LIMIT 1`,
            args: [userId],
          }),
        ]);
        return appStateFromRows(stateResult.rows[0], matchResult.rows[0]);
      },
      async getLastPollAt(): Promise<string | undefined> {
        const result = await execute({
          sql: "SELECT last_poll_at FROM app_states WHERE user_id = ?",
          args: [userId],
        });
        return stringValue(result.rows[0]?.last_poll_at);
      },
      async getDashboardSnapshot(): Promise<DashboardSnapshot> {
        const [settings, state, pendingMatches] = await Promise.all([
          this.getSettings(),
          this.getAppState(),
          listMatches(userId, "pending"),
        ]);
        return { pendingMatches, settings, state };
      },
      async listHistory(): Promise<MatchRecord[]> {
        return await listMatches(userId, "history");
      },
      async listPendingMatches(): Promise<MatchRecord[]> {
        return await listMatches(userId, "pending");
      },
      async saveMatch(record: MatchRecord): Promise<void> {
        await writeEntity("match", entityKey(userId, record.id), {
          sql: `INSERT INTO matches
              (user_id, id, matched_at, post_published_at, completed_at,
                notified_at, value_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET
              matched_at = excluded.matched_at,
              post_published_at = excluded.post_published_at,
              completed_at = excluded.completed_at,
              notified_at = excluded.notified_at,
              value_json = excluded.value_json`,
          args: [
            userId,
            record.id,
            record.matchedAt,
            record.post.publishedAt,
            record.completedAt ?? null,
            record.notifiedAt ?? null,
            JSON.stringify(record),
          ],
        });
      },
      async markMatchNotified(id: string, notifiedAt: string): Promise<void> {
        await writeEntity("match", entityKey(userId, id), {
          sql: `UPDATE matches
            SET notified_at = ?,
              value_json = json_set(value_json, '$.notifiedAt', ?)
            WHERE user_id = ? AND id = ?`,
          args: [notifiedAt, notifiedAt, userId, id],
        });
      },
      async completeMatches(ids: string[]): Promise<void> {
        const uniqueIds = normalizedIds(ids);
        if (uniqueIds.length === 0) {
          return;
        }
        const completedAt = new Date().toISOString();
        await batch(uniqueIds.flatMap((id) => [
          {
            sql: `UPDATE matches
              SET completed_at = ?,
                value_json = json_set(value_json, '$.completedAt', ?)
              WHERE user_id = ? AND id = ?`,
            args: [completedAt, completedAt, userId, id],
          },
          mutationStatement("match", entityKey(userId, id), true),
          clearTombstoneStatement("match", entityKey(userId, id)),
        ]));
      },
      async deleteMatches(ids: string[]): Promise<void> {
        const uniqueIds = normalizedIds(ids);
        if (uniqueIds.length === 0) {
          return;
        }
        const deletedAt = new Date().toISOString();
        await batch([
          {
            sql: `DELETE FROM matches
              WHERE user_id = ? AND id IN (${placeholders(uniqueIds.length)})`,
            args: [userId, ...uniqueIds],
          },
          ...uniqueIds.map((id) =>
            tombstoneStatement(
              "match",
              entityKey(userId, id),
              deletedAt,
            )
          ),
        ]);
      },
      async setLastPollAt(value: string): Promise<void> {
        await writeEntity("state", userId, {
          sql: `INSERT INTO app_states (user_id, last_poll_at)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET last_poll_at = excluded.last_poll_at`,
          args: [userId, value],
        });
      },
    };
  }

  const defaultUserStorage = forUser("default");

  return {
    ...defaultUserStorage,
    forUser,

    /**
     * 判断 KV 实体是否可以安全回填。
     *
     * @param {string} entityType 实体类型。
     * @param {string} entityKey 实体稳定键。
     * @return {Promise<boolean>} 未实时变更且未删除时返回 true。
     */
    async canImportKvEntity(
      entityType: string,
      entityKey: string,
    ): Promise<boolean> {
      const result = await execute({
        sql: `SELECT 1 AS blocked FROM storage_tombstones
            WHERE entity_type = ? AND entity_key = ?
          UNION ALL
          SELECT 1 AS blocked FROM storage_mutations
            WHERE entity_type = ? AND entity_key = ?
          LIMIT 1`,
        args: [entityType, entityKey, entityType, entityKey],
      });
      return result.rows.length === 0;
    },

    /**
     * 按账号 ID 获取账号。
     *
     * @param {string} id 账号 ID。
     * @return {Promise<UserAccount | undefined>} 账号信息。
     */
    async getAccountById(id: string): Promise<UserAccount | undefined> {
      return await readJsonValue<UserAccount>(
        execute,
        "SELECT value_json FROM user_accounts WHERE id = ?",
        [id],
      );
    },

    /**
     * 按用户名获取账号。
     *
     * @param {string} username 用户名。
     * @return {Promise<UserAccount | undefined>} 账号信息。
     */
    async getAccountByUsername(
      username: string,
    ): Promise<UserAccount | undefined> {
      return await readJsonValue<UserAccount>(
        execute,
        "SELECT value_json FROM user_accounts WHERE username_normalized = ?",
        [normalizeUsername(username)],
      );
    },

    /**
     * 列出全部账号。
     *
     * @return {Promise<UserAccount[]>} 账号列表。
     */
    async listAccounts(): Promise<UserAccount[]> {
      const result = await execute(
        "SELECT value_json FROM user_accounts ORDER BY created_at, id",
      );
      return result.rows.map((row) => parseJsonRow<UserAccount>(row));
    },

    /**
     * 保存账号信息。
     *
     * @param {UserAccount} account 账号信息。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveAccount(account: UserAccount): Promise<void> {
      await writeEntity("account", account.id, accountUpsert(account));
    },

    /**
     * 原子创建账号。
     *
     * @param {UserAccount} account 账号信息。
     * @return {Promise<boolean>} 创建成功时返回 true。
     */
    async createAccount(account: UserAccount): Promise<boolean> {
      try {
        const [result] = await batch([
          {
            sql: `INSERT INTO user_accounts
                (id, username, username_normalized, created_at, value_json)
              VALUES (?, ?, ?, ?, ?)`,
            args: accountArgs(account),
          },
          mutationStatement("account", account.id, true),
        ]);
        return result.rowsAffected === 1;
      } catch (error) {
        if (isConstraintError(error)) {
          return false;
        }
        throw error;
      }
    },

    /**
     * 原子更新账号。
     *
     * @param {UserAccount} account 账号信息。
     * @return {Promise<boolean>} 更新成功时返回 true。
     */
    async updateAccount(account: UserAccount): Promise<boolean> {
      try {
        const [result] = await batch([
          {
            sql: `UPDATE user_accounts SET
                username = ?, username_normalized = ?, created_at = ?, value_json = ?
              WHERE id = ?`,
            args: [
              account.username,
              normalizeUsername(account.username),
              account.createdAt,
              JSON.stringify(account),
              account.id,
            ],
          },
          mutationStatement("account", account.id, true),
        ]);
        return result.rowsAffected === 1;
      } catch (error) {
        if (isConstraintError(error)) {
          return false;
        }
        throw error;
      }
    },

    /**
     * 获取用户安全设置。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<UserSecuritySettings>} 用户安全设置。
     */
    async getUserSecuritySettings(
      userId: string,
    ): Promise<UserSecuritySettings> {
      const value = await readJsonValue<Partial<UserSecuritySettings>>(
        execute,
        "SELECT value_json FROM user_security_settings WHERE user_id = ?",
        [userId],
      );
      return normalizeUserSecuritySettings(value, userId);
    },

    /**
     * 保存用户安全设置。
     *
     * @param {UserSecuritySettings} settings 用户安全设置。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveUserSecuritySettings(
      settings: UserSecuritySettings,
    ): Promise<void> {
      const normalized = normalizeUserSecuritySettings(
        settings,
        settings.userId,
      );
      await writeEntity("security-settings", normalized.userId, {
        sql: `INSERT INTO user_security_settings (user_id, value_json)
          VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json`,
        args: [normalized.userId, JSON.stringify(normalized)],
      });
    },

    /**
     * 获取指定用途的认证事件。
     *
     * @param {string} userId 用户 ID。
     * @param {AuthenticationEventPurpose} purpose 认证用途。
     * @return {Promise<AuthenticationEvent | undefined>} 认证事件。
     */
    async getAuthenticationEvent(
      userId: string,
      purpose: AuthenticationEventPurpose,
    ): Promise<AuthenticationEvent | undefined> {
      const event = await readJsonValue<AuthenticationEvent>(
        execute,
        `SELECT value_json FROM authentication_events
          WHERE user_id = ? AND purpose = ?`,
        [userId, purpose],
      );
      return event
        ? normalizeAuthenticationEvent(event, userId, purpose)
        : undefined;
    },

    /**
     * 原子消费指定用途的认证事件。
     *
     * @param {string} userId 用户 ID。
     * @param {AuthenticationEventPurpose} purpose 认证用途。
     * @return {Promise<AuthenticationEvent | undefined>} 消费到的认证事件。
     */
    async consumeAuthenticationEvent(
      userId: string,
      purpose: AuthenticationEventPurpose,
    ): Promise<AuthenticationEvent | undefined> {
      const result = await execute({
        sql: `DELETE FROM authentication_events
          WHERE user_id = ? AND purpose = ?
          RETURNING value_json`,
        args: [userId, purpose],
      });
      if (!result.rows[0]) {
        return undefined;
      }
      return normalizeAuthenticationEvent(
        parseJsonRow<AuthenticationEvent>(result.rows[0]),
        userId,
        purpose,
      );
    },

    /**
     * 保存认证事件。
     *
     * @param {AuthenticationEvent} event 认证事件。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveAuthenticationEvent(event: AuthenticationEvent): Promise<void> {
      const normalized = normalizeAuthenticationEvent(
        event,
        event.userId,
        event.purpose,
      );
      await writeEntity(
        "authentication-event",
        entityKey(normalized.userId, normalized.purpose),
        {
          sql: `INSERT INTO authentication_events
              (user_id, purpose, authenticated_at, value_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, purpose) DO UPDATE SET
              authenticated_at = excluded.authenticated_at,
              value_json = excluded.value_json`,
          args: [
            normalized.userId,
            normalized.purpose,
            normalized.authenticatedAt,
            JSON.stringify(normalized),
          ],
        },
      );
    },

    /**
     * 获取密码凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<PasswordCredential | undefined>} 密码凭证。
     */
    async getPasswordCredential(
      userId: string,
    ): Promise<PasswordCredential | undefined> {
      return await readJsonValue<PasswordCredential>(
        execute,
        "SELECT value_json FROM password_credentials WHERE user_id = ?",
        [userId],
      );
    },

    /**
     * 保存密码凭证。
     *
     * @param {PasswordCredential} credential 密码凭证。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePasswordCredential(
      credential: PasswordCredential,
    ): Promise<void> {
      await writeEntity("password-credential", credential.userId, {
        sql: `INSERT INTO password_credentials
            (user_id, updated_at, value_json)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            updated_at = excluded.updated_at,
            value_json = excluded.value_json`,
        args: [
          credential.userId,
          credential.updatedAt,
          JSON.stringify(credential),
        ],
      });
    },

    /**
     * 获取首个 TOTP 凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<TotpCredential | undefined>} TOTP 凭证。
     */
    async getTotpCredential(
      userId: string,
    ): Promise<TotpCredential | undefined> {
      return (await this.listTotpCredentials(userId))[0];
    },

    /**
     * 列出用户的 TOTP 凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<TotpCredential[]>} TOTP 凭证列表。
     */
    async listTotpCredentials(userId: string): Promise<TotpCredential[]> {
      const result = await execute({
        sql: `SELECT value_json FROM totp_credentials
          WHERE user_id = ? ORDER BY enabled_at, credential_id`,
        args: [userId],
      });
      return result.rows.map((row) =>
        normalizeTotpCredential(parseJsonRow<TotpCredential>(row), userId)
      );
    },

    /**
     * 保存 TOTP 凭证。
     *
     * @param {TotpCredential} credential TOTP 凭证。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveTotpCredential(credential: TotpCredential): Promise<void> {
      const normalized = normalizeTotpCredential(
        credential,
        credential.userId,
      );
      const credentialId = normalized.credentialId ?? "legacy";
      await writeEntity(
        "totp-credential",
        entityKey(normalized.userId, credentialId),
        {
          sql: `INSERT INTO totp_credentials
              (user_id, credential_id, enabled_at, value_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, credential_id) DO UPDATE SET
              enabled_at = excluded.enabled_at,
              value_json = excluded.value_json`,
          args: [
            normalized.userId,
            credentialId,
            normalized.enabledAt,
            JSON.stringify(normalized),
          ],
        },
      );
    },

    /**
     * 删除 TOTP 凭证。
     *
     * @param {string} userId 用户 ID。
     * @param {string} credentialId 凭证 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deleteTotpCredential(
      userId: string,
      credentialId = "legacy",
    ): Promise<void> {
      const normalizedId = credentialId || "legacy";
      await deleteEntity(
        "totp-credential",
        entityKey(userId, normalizedId),
        {
          sql: `DELETE FROM totp_credentials
            WHERE user_id = ? AND credential_id = ?`,
          args: [userId, normalizedId],
        },
      );
    },

    /**
     * 获取指定用户的 Passkey 凭证。
     *
     * @param {string} userId 用户 ID。
     * @param {string} credentialId 凭证 ID。
     * @return {Promise<PasskeyCredential | undefined>} Passkey 凭证。
     */
    async getPasskeyCredential(
      userId: string,
      credentialId: string,
    ): Promise<PasskeyCredential | undefined> {
      const value = await readJsonValue<PasskeyCredential>(
        execute,
        `SELECT value_json FROM passkey_credentials
          WHERE user_id = ? AND credential_id = ?`,
        [userId, credentialId],
      );
      return value ? normalizePasskeyCredential(value, userId) : undefined;
    },

    /**
     * 列出用户的 Passkey 凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<PasskeyCredential[]>} Passkey 凭证列表。
     */
    async listPasskeyCredentials(
      userId: string,
    ): Promise<PasskeyCredential[]> {
      const result = await execute({
        sql: `SELECT value_json FROM passkey_credentials
          WHERE user_id = ? ORDER BY created_at, credential_id`,
        args: [userId],
      });
      return result.rows.map((row) =>
        normalizePasskeyCredential(
          parseJsonRow<PasskeyCredential>(row),
          userId,
        )
      );
    },

    /**
     * 按凭证 ID 反查 Passkey 凭证。
     *
     * @param {string} credentialId 凭证 ID。
     * @return {Promise<PasskeyCredential | undefined>} Passkey 凭证。
     */
    async getPasskeyCredentialByCredentialId(
      credentialId: string,
    ): Promise<PasskeyCredential | undefined> {
      const normalizedId = credentialId.trim();
      if (!normalizedId) {
        return undefined;
      }
      const value = await readJsonValue<PasskeyCredential>(
        execute,
        "SELECT value_json FROM passkey_credentials WHERE credential_id = ?",
        [normalizedId],
      );
      return value
        ? normalizePasskeyCredential(value, value.userId)
        : undefined;
    },

    /**
     * 保存 Passkey 凭证。
     *
     * @param {PasskeyCredential} credential Passkey 凭证。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePasskeyCredential(
      credential: PasskeyCredential,
    ): Promise<void> {
      const normalized = normalizePasskeyCredential(
        credential,
        credential.userId,
      );
      const result = await writeEntity(
        "passkey-credential",
        normalized.credentialId,
        {
          sql: `INSERT INTO passkey_credentials
              (credential_id, user_id, created_at, value_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(credential_id) DO UPDATE SET
              created_at = excluded.created_at,
              value_json = excluded.value_json
            WHERE passkey_credentials.user_id = excluded.user_id`,
          args: [
            normalized.credentialId,
            normalized.userId,
            normalized.createdAt,
            JSON.stringify(normalized),
          ],
        },
      );
      if (result.rowsAffected !== 1) {
        throw new Error("Passkey credential already belongs to another user.");
      }
    },

    /**
     * 删除 Passkey 凭证。
     *
     * @param {string} userId 用户 ID。
     * @param {string} credentialId 凭证 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePasskeyCredential(
      userId: string,
      credentialId: string,
    ): Promise<void> {
      await deleteEntity("passkey-credential", credentialId, {
        sql: `DELETE FROM passkey_credentials
          WHERE user_id = ? AND credential_id = ?`,
        args: [userId, credentialId],
      });
    },

    /**
     * 获取身份绑定。
     *
     * @param {AuthIdentityProvider} provider 身份提供方。
     * @param {string} providerUserId 提供方用户 ID。
     * @return {Promise<AuthIdentity | undefined>} 身份绑定。
     */
    async getAuthIdentity(
      provider: AuthIdentityProvider,
      providerUserId: string,
    ): Promise<AuthIdentity | undefined> {
      return await readJsonValue<AuthIdentity>(
        execute,
        `SELECT value_json FROM auth_identities
          WHERE provider = ? AND provider_user_id = ?`,
        [provider, providerUserId],
      );
    },

    /**
     * 列出用户在指定提供方的身份绑定。
     *
     * @param {AuthIdentityProvider} provider 身份提供方。
     * @param {string} userId 用户 ID。
     * @return {Promise<AuthIdentity[]>} 身份绑定列表。
     */
    async listAuthIdentitiesForUser(
      provider: AuthIdentityProvider,
      userId: string,
    ): Promise<AuthIdentity[]> {
      const result = await execute({
        sql: `SELECT value_json FROM auth_identities
          WHERE provider = ? AND user_id = ?
          ORDER BY created_at, provider_user_id`,
        args: [provider, userId],
      });
      return result.rows.map((row) => parseJsonRow<AuthIdentity>(row));
    },

    /**
     * 保存身份绑定。
     *
     * @param {AuthIdentity} identity 身份绑定。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveAuthIdentity(identity: AuthIdentity): Promise<void> {
      await writeEntity(
        "auth-identity",
        entityKey(identity.provider, identity.providerUserId),
        {
          sql: `INSERT INTO auth_identities
              (provider, provider_user_id, user_id, created_at, value_json)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider, provider_user_id) DO UPDATE SET
              user_id = excluded.user_id,
              created_at = excluded.created_at,
              value_json = excluded.value_json`,
          args: [
            identity.provider,
            identity.providerUserId,
            identity.userId,
            identity.createdAt,
            JSON.stringify(identity),
          ],
        },
      );
    },

    /**
     * 删除身份绑定。
     *
     * @param {AuthIdentityProvider} provider 身份提供方。
     * @param {string} providerUserId 提供方用户 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deleteAuthIdentity(
      provider: AuthIdentityProvider,
      providerUserId: string,
    ): Promise<void> {
      await deleteEntity(
        "auth-identity",
        entityKey(provider, providerUserId),
        {
          sql: `DELETE FROM auth_identities
            WHERE provider = ? AND provider_user_id = ?`,
          args: [provider, providerUserId],
        },
      );
    },

    /**
     * 获取邮箱凭证。
     *
     * @param {string} userId 用户 ID。
     * @param {string} email 邮箱地址。
     * @return {Promise<EmailCredential | undefined>} 邮箱凭证。
     */
    async getEmailCredential(
      userId: string,
      email: string,
    ): Promise<EmailCredential | undefined> {
      return await readJsonValue<EmailCredential>(
        execute,
        `SELECT value_json FROM email_credentials
          WHERE user_id = ? AND email_normalized = ?`,
        [userId, emailKey(email)],
      );
    },

    /**
     * 列出邮箱凭证。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<EmailCredential[]>} 邮箱凭证列表。
     */
    async listEmailCredentials(userId: string): Promise<EmailCredential[]> {
      const result = await execute({
        sql: `SELECT value_json FROM email_credentials
          WHERE user_id = ? ORDER BY email_normalized`,
        args: [userId],
      });
      return result.rows.map((row) => parseJsonRow<EmailCredential>(row));
    },

    /**
     * 保存邮箱凭证。
     *
     * @param {EmailCredential} credential 邮箱凭证。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveEmailCredential(credential: EmailCredential): Promise<void> {
      const normalized = { ...credential, email: emailKey(credential.email) };
      await writeEntity(
        "email-credential",
        entityKey(normalized.userId, normalized.email),
        {
          sql: `INSERT INTO email_credentials
              (user_id, email_normalized, created_at, value_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, email_normalized) DO UPDATE SET
              created_at = excluded.created_at,
              value_json = excluded.value_json`,
          args: [
            normalized.userId,
            normalized.email,
            normalized.createdAt,
            JSON.stringify(normalized),
          ],
        },
      );
    },

    /**
     * 删除邮箱凭证。
     *
     * @param {string} userId 用户 ID。
     * @param {string} email 邮箱地址。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deleteEmailCredential(userId: string, email: string): Promise<void> {
      const normalizedEmail = emailKey(email);
      await deleteEntity(
        "email-credential",
        entityKey(userId, normalizedEmail),
        {
          sql: `DELETE FROM email_credentials
            WHERE user_id = ? AND email_normalized = ?`,
          args: [userId, normalizedEmail],
        },
      );
    },

    /**
     * 获取待处理邮箱验证。
     *
     * @param {string} id 验证 ID。
     * @return {Promise<PendingEmailVerification | undefined>} 待处理验证。
     */
    async getPendingEmailVerification(
      id: string,
    ): Promise<PendingEmailVerification | undefined> {
      return await readUnexpiredJsonValue<PendingEmailVerification>(
        execute,
        "pending_email_verifications",
        id,
      );
    },

    /**
     * 保存待处理邮箱验证。
     *
     * @param {PendingEmailVerification} verification 待处理验证。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePendingEmailVerification(
      verification: PendingEmailVerification,
    ): Promise<void> {
      const normalized = {
        ...verification,
        email: emailKey(verification.email),
      };
      await saveExpiringEntity(
        writeEntity,
        "pending-email-verification",
        "pending_email_verifications",
        normalized.id,
        normalized.expiresAt,
        normalized,
      );
    },

    /**
     * 删除待处理邮箱验证。
     *
     * @param {string} id 验证 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePendingEmailVerification(id: string): Promise<void> {
      await deleteById(
        deleteEntity,
        "pending-email-verification",
        "pending_email_verifications",
        id,
      );
    },

    /**
     * 获取待处理 MFA challenge。
     *
     * @param {string} id challenge ID。
     * @return {Promise<PendingMfaChallenge | undefined>} 待处理 challenge。
     */
    async getPendingMfaChallenge(
      id: string,
    ): Promise<PendingMfaChallenge | undefined> {
      const challenge = await readUnexpiredJsonValue<PendingMfaChallenge>(
        execute,
        "pending_mfa_challenges",
        id,
      );
      return challenge ? normalizePendingMfaChallenge(challenge) : undefined;
    },

    /**
     * 保存待处理 MFA challenge。
     *
     * @param {PendingMfaChallenge} challenge 待处理 challenge。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePendingMfaChallenge(
      challenge: PendingMfaChallenge,
    ): Promise<void> {
      const normalized = normalizePendingMfaChallenge(challenge);
      await saveExpiringEntity(
        writeEntity,
        "pending-mfa-challenge",
        "pending_mfa_challenges",
        normalized.id,
        normalized.expiresAt,
        normalized,
      );
    },

    /**
     * 删除待处理 MFA challenge。
     *
     * @param {string} id challenge ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePendingMfaChallenge(id: string): Promise<void> {
      await deleteById(
        deleteEntity,
        "pending-mfa-challenge",
        "pending_mfa_challenges",
        id,
      );
    },

    /**
     * 获取待处理 Passkey challenge。
     *
     * @param {string} id challenge ID。
     * @return {Promise<PendingPasskeyChallenge | undefined>} 待处理 challenge。
     */
    async getPendingPasskeyChallenge(
      id: string,
    ): Promise<PendingPasskeyChallenge | undefined> {
      const challenge = await readUnexpiredJsonValue<PendingPasskeyChallenge>(
        execute,
        "pending_passkey_challenges",
        id,
      );
      return challenge
        ? normalizePendingPasskeyChallenge(challenge)
        : undefined;
    },

    /**
     * 保存待处理 Passkey challenge。
     *
     * @param {PendingPasskeyChallenge} challenge 待处理 challenge。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePendingPasskeyChallenge(
      challenge: PendingPasskeyChallenge,
    ): Promise<void> {
      const normalized = normalizePendingPasskeyChallenge(challenge);
      await saveExpiringEntity(
        writeEntity,
        "pending-passkey-challenge",
        "pending_passkey_challenges",
        normalized.id,
        normalized.expiresAt,
        normalized,
      );
    },

    /**
     * 删除待处理 Passkey challenge。
     *
     * @param {string} id challenge ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePendingPasskeyChallenge(id: string): Promise<void> {
      await deleteById(
        deleteEntity,
        "pending-passkey-challenge",
        "pending_passkey_challenges",
        id,
      );
    },

    /**
     * 获取等待展示的恢复码。
     *
     * @param {string} id 记录 ID。
     * @return {Promise<PendingRecoveryCodeReveal | undefined>} 恢复码记录。
     */
    async getPendingRecoveryCodeReveal(
      id: string,
    ): Promise<PendingRecoveryCodeReveal | undefined> {
      return await readUnexpiredJsonValue<PendingRecoveryCodeReveal>(
        execute,
        "pending_recovery_code_reveals",
        id,
      );
    },

    /**
     * 保存等待展示的恢复码。
     *
     * @param {PendingRecoveryCodeReveal} reveal 恢复码记录。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async savePendingRecoveryCodeReveal(
      reveal: PendingRecoveryCodeReveal,
    ): Promise<void> {
      await saveExpiringEntity(
        writeEntity,
        "pending-recovery-code-reveal",
        "pending_recovery_code_reveals",
        reveal.id,
        reveal.expiresAt,
        reveal,
      );
    },

    /**
     * 删除等待展示的恢复码。
     *
     * @param {string} id 记录 ID。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deletePendingRecoveryCodeReveal(id: string): Promise<void> {
      await deleteById(
        deleteEntity,
        "pending-recovery-code-reveal",
        "pending_recovery_code_reveals",
        id,
      );
    },

    /**
     * 获取登录失败状态。
     *
     * @param {string} username 用户名或登录标识。
     * @return {Promise<LoginFailure | undefined>} 登录失败状态。
     */
    async getLoginFailure(
      username: string,
    ): Promise<LoginFailure | undefined> {
      const result = await execute({
        sql: `SELECT failures, locked_until FROM login_failures
          WHERE username_normalized = ? AND expires_at > ?`,
        args: [normalizeUsername(username), new Date().toISOString()],
      });
      return loginFailureFromRow(result.rows[0]);
    },

    /**
     * 原子记录登录失败。
     *
     * @param {string} username 用户名或登录标识。
     * @param {number} maxFailures 最大失败次数。
     * @param {number} lockoutMs 锁定时长。
     * @return {Promise<LoginFailure>} 更新后的登录失败状态。
     */
    async recordLoginFailure(
      username: string,
      maxFailures: number,
      lockoutMs: number,
    ): Promise<LoginFailure> {
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + Math.max(1, lockoutMs)).toISOString();
      const lockedUntil = expiresAt;
      const result = await execute({
        sql: `INSERT INTO login_failures
            (username_normalized, failures, locked_until, expires_at)
          VALUES (:username, 1,
            CASE WHEN 1 >= :max_failures THEN :locked_until ELSE NULL END,
            :expires_at)
          ON CONFLICT(username_normalized) DO UPDATE SET
            failures = CASE
              WHEN login_failures.locked_until IS NOT NULL
                AND login_failures.locked_until > :now
                THEN login_failures.failures
              WHEN login_failures.expires_at <= :now THEN 1
              ELSE login_failures.failures + 1
            END,
            locked_until = CASE
              WHEN login_failures.locked_until IS NOT NULL
                AND login_failures.locked_until > :now
                THEN login_failures.locked_until
              WHEN (CASE
                WHEN login_failures.expires_at <= :now THEN 1
                ELSE login_failures.failures + 1
              END) >= :max_failures THEN :locked_until
              ELSE NULL
            END,
            expires_at = CASE
              WHEN login_failures.locked_until IS NOT NULL
                AND login_failures.locked_until > :now
                THEN login_failures.expires_at
              ELSE :expires_at
            END
          RETURNING failures, locked_until`,
        args: {
          expires_at: expiresAt,
          locked_until: lockedUntil,
          max_failures: Math.max(1, Math.floor(maxFailures)),
          now,
          username: normalizeUsername(username),
        },
      });
      const failure = loginFailureFromRow(result.rows[0]);
      if (!failure) {
        throw new Error("Could not record a login failure.");
      }
      return failure;
    },

    /**
     * 清除登录失败状态。
     *
     * @param {string} username 用户名或登录标识。
     * @return {Promise<void>} 清除完成后的 Promise。
     */
    async clearLoginFailures(username: string): Promise<void> {
      const normalizedUsername = normalizeUsername(username);
      await deleteEntity("login-failure", normalizedUsername, {
        sql: "DELETE FROM login_failures WHERE username_normalized = ?",
        args: [normalizedUsername],
      });
    },

    /**
     * 原子记录频率限制命中。
     *
     * @param {readonly string[]} keyParts 频率限制键片段。
     * @param {number} limit 窗口内最大次数。
     * @param {number} windowMs 窗口时长。
     * @return {Promise<RateLimitHit>} 频率限制命中结果。
     */
    async recordRateLimitHit(
      keyParts: readonly string[],
      limit: number,
      windowMs: number,
    ): Promise<RateLimitHit> {
      const normalizedLimit = Math.max(1, Math.floor(limit));
      const normalizedWindowMs = Math.max(1000, Math.floor(windowMs));
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const nextResetAt = new Date(nowMs + normalizedWindowMs).toISOString();
      const result = await execute({
        sql: `INSERT INTO rate_limits (key_json, count, reset_at)
          VALUES (:key_json, 1, :next_reset_at)
          ON CONFLICT(key_json) DO UPDATE SET
            count = CASE WHEN rate_limits.reset_at > :now
              THEN rate_limits.count + 1 ELSE 1 END,
            reset_at = CASE WHEN rate_limits.reset_at > :now
              THEN rate_limits.reset_at ELSE :next_reset_at END
          RETURNING count, reset_at`,
        args: {
          key_json: JSON.stringify(keyParts),
          next_reset_at: nextResetAt,
          now,
        },
      });
      const row = result.rows[0];
      const count = numberValue(row?.count);
      const resetAt = stringValue(row?.reset_at) ?? nextResetAt;
      const resetAtMs = Date.parse(resetAt);
      return {
        allowed: count <= normalizedLimit,
        count,
        limit: normalizedLimit,
        resetAt,
        retryAfterSeconds: Number.isFinite(resetAtMs)
          ? Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000))
          : 1,
      };
    },

    /**
     * 获取登录会话。
     *
     * @param {string} tokenHash 会话令牌哈希。
     * @return {Promise<UserSession | undefined>} 登录会话。
     */
    async getSession(tokenHash: string): Promise<UserSession | undefined> {
      return await readJsonValue<UserSession>(
        execute,
        "SELECT value_json FROM sessions WHERE token_hash = ?",
        [tokenHash],
      );
    },

    /**
     * 保存登录会话。
     *
     * @param {UserSession} session 登录会话。
     * @return {Promise<void>} 保存完成后的 Promise。
     */
    async saveSession(session: UserSession): Promise<void> {
      await writeEntity("session", session.tokenHash, {
        sql: `INSERT INTO sessions
            (token_hash, user_id, expires_at, value_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(token_hash) DO UPDATE SET
            user_id = excluded.user_id,
            expires_at = excluded.expires_at,
            value_json = excluded.value_json`,
        args: [
          session.tokenHash,
          session.userId,
          session.expiresAt,
          JSON.stringify(session),
        ],
      });
    },

    /**
     * 删除登录会话。
     *
     * @param {string} tokenHash 会话令牌哈希。
     * @return {Promise<void>} 删除完成后的 Promise。
     */
    async deleteSession(tokenHash: string): Promise<void> {
      await deleteEntity("session", tokenHash, {
        sql: "DELETE FROM sessions WHERE token_hash = ?",
        args: [tokenHash],
      });
    },
  };
}

/**
 * 创建远程 Turso HTTP 客户端。
 *
 * @param {TursoStorageOptions} options Turso 连接选项。
 * @return {TursoClient} libSQL 客户端。
 */
function createRemoteClient(options: TursoStorageOptions): TursoClient {
  const url = options.url?.trim();
  const authToken = options.authToken?.trim();
  if (!url || !authToken) {
    throw new Error(
      "Turso storage requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    );
  }
  return createClient({ authToken, url });
}

/**
 * 确保 Turso 数据库已经应用当前 schema。
 *
 * @param {TursoClient} client libSQL 客户端。
 * @return {Promise<void>} schema 就绪后的 Promise。
 */
async function ensureTursoSchema(client: TursoClient): Promise<void> {
  try {
    const result = await client.execute(
      "SELECT MAX(version) AS version FROM schema_migrations",
    );
    if (numberValue(result.rows[0]?.version) >= TURSO_SCHEMA_VERSION) {
      return;
    }
  } catch {
    // 首次运行时迁移表尚不存在，继续执行幂等建表语句。
  }
  await client.batch(TURSO_SCHEMA_STATEMENTS, "write");
}

/**
 * 读取单条 JSON 业务对象。
 *
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行函数。
 * @param {string} sql 查询语句。
 * @param {InArgs} args 查询参数。
 * @return {Promise<T | undefined>} 业务对象。
 */
async function readJsonValue<T>(
  execute: (statement: InStatement) => Promise<ResultSet>,
  sql: string,
  args: InArgs,
): Promise<T | undefined> {
  const result = await execute({ sql, args });
  return result.rows[0] ? parseJsonRow<T>(result.rows[0]) : undefined;
}

/**
 * 读取尚未过期的 JSON 业务对象。
 *
 * @param {(statement: InStatement) => Promise<ResultSet>} execute SQL 执行函数。
 * @param {string} table 表名。
 * @param {string} id 记录 ID。
 * @return {Promise<T | undefined>} 未过期业务对象。
 */
async function readUnexpiredJsonValue<T>(
  execute: (statement: InStatement) => Promise<ResultSet>,
  table: string,
  id: string,
): Promise<T | undefined> {
  assertKnownExpiringTable(table);
  return await readJsonValue<T>(
    execute,
    `SELECT value_json FROM ${table} WHERE id = ? AND expires_at > ?`,
    [id, new Date().toISOString()],
  );
}

/**
 * 保存带过期时间的 JSON 业务对象。
 *
 * @param {Function} writeEntity 数据写入函数。
 * @param {string} entityType 实体类型。
 * @param {string} table 表名。
 * @param {string} id 记录 ID。
 * @param {string} expiresAt 过期时间。
 * @param {T} value 业务对象。
 * @return {Promise<void>} 保存完成后的 Promise。
 */
async function saveExpiringEntity<T>(
  writeEntity: (
    entityType: string,
    entityKey: string,
    statement: InStatement,
  ) => Promise<ResultSet>,
  entityType: string,
  table: string,
  id: string,
  expiresAt: string,
  value: T,
): Promise<void> {
  assertKnownExpiringTable(table);
  await writeEntity(entityType, id, {
    sql: `INSERT INTO ${table} (id, expires_at, value_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        expires_at = excluded.expires_at,
        value_json = excluded.value_json`,
    args: [id, expiresAt, JSON.stringify(value)],
  });
}

/**
 * 删除按 ID 保存的业务对象。
 *
 * @param {Function} deleteEntity 数据删除函数。
 * @param {string} entityType 实体类型。
 * @param {string} table 表名。
 * @param {string} id 记录 ID。
 * @return {Promise<void>} 删除完成后的 Promise。
 */
async function deleteById(
  deleteEntity: (
    entityType: string,
    entityKey: string,
    statement: InStatement,
  ) => Promise<void>,
  entityType: string,
  table: string,
  id: string,
): Promise<void> {
  assertKnownExpiringTable(table);
  await deleteEntity(entityType, id, {
    sql: `DELETE FROM ${table} WHERE id = ?`,
    args: [id],
  });
}

/**
 * 校验动态 SQL 使用的是已知过期数据表。
 *
 * @param {string} table 表名。
 */
function assertKnownExpiringTable(table: string): void {
  const tables = new Set([
    "pending_email_verifications",
    "pending_mfa_challenges",
    "pending_passkey_challenges",
    "pending_recovery_code_reveals",
  ]);
  if (!tables.has(table)) {
    throw new Error("Unsupported expiring storage table.");
  }
}

/**
 * 从结果行解析 JSON 业务对象。
 *
 * @param {Row} row SQL 结果行。
 * @return {T} 业务对象。
 */
function parseJsonRow<T>(row: Row): T {
  const value = row.value_json;
  if (typeof value !== "string") {
    throw new Error("Storage row does not contain JSON text.");
  }
  return JSON.parse(value) as T;
}

/**
 * 从 SQL 值读取字符串。
 *
 * @param {unknown} value SQL 值。
 * @return {string | undefined} 字符串值。
 */
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * 从 SQL 值读取有限数字。
 *
 * @param {unknown} value SQL 值。
 * @return {number} 数字值。
 */
function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * 将状态查询结果转换为应用状态。
 *
 * @param {Row | undefined} stateRow 状态结果行。
 * @param {Row | undefined} matchRow 最新命中结果行。
 * @return {AppState} 应用状态。
 */
function appStateFromRows(
  stateRow: Row | undefined,
  matchRow: Row | undefined,
): AppState {
  const latestMatch = matchRow
    ? latestMatchByMatchedTime([parseJsonRow<MatchRecord>(matchRow)])
    : undefined;
  return {
    lastPollAt: stringValue(stateRow?.last_poll_at),
    latestMatch,
    totalMatches: numberValue(matchRow?.total_matches),
  };
}

/**
 * 创建账号 UPSERT 语句。
 *
 * @param {UserAccount} account 账号信息。
 * @return {InStatement} SQL 语句。
 */
function accountUpsert(account: UserAccount): InStatement {
  return {
    sql: `INSERT INTO user_accounts
        (id, username, username_normalized, created_at, value_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        username_normalized = excluded.username_normalized,
        created_at = excluded.created_at,
        value_json = excluded.value_json`,
    args: accountArgs(account),
  };
}

/**
 * 将账号转换为 SQL 参数。
 *
 * @param {UserAccount} account 账号信息。
 * @return {InArgs} SQL 参数。
 */
function accountArgs(account: UserAccount): InArgs {
  return [
    account.id,
    account.username,
    normalizeUsername(account.username),
    account.createdAt,
    JSON.stringify(account),
  ];
}

/**
 * 规范化用户名。
 *
 * @param {string} value 原始用户名。
 * @return {string} 规范化用户名。
 */
function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 规范化邮箱地址并用于索引。
 *
 * @param {string} value 原始邮箱地址。
 * @return {string} 规范化邮箱地址。
 */
function emailKey(value: string): string {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) {
    throw new Error("Invalid email address.");
  }
  return normalized;
}

/**
 * 规范化 TOTP 凭证。
 *
 * @param {TotpCredential} credential TOTP 凭证。
 * @param {string} userId 用户 ID。
 * @return {TotpCredential} 规范化凭证。
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
 * @param {PasskeyCredential} credential Passkey 凭证。
 * @param {string} userId 用户 ID。
 * @return {PasskeyCredential} 规范化凭证。
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
    label: typeof credential.label === "string" && credential.label.trim()
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
 * @param {AuthenticationEvent} event 认证事件。
 * @param {string} userId 用户 ID。
 * @param {AuthenticationEventPurpose} purpose 认证用途。
 * @return {AuthenticationEvent} 规范化事件。
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
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
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
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
 */
function isAuthenticationEventPurpose(
  value: unknown,
): value is AuthenticationEventPurpose {
  return value === "primary_login" || value === "reauth" ||
    value === "recovery_codes" || value === "second_factor";
}

/**
 * 规范化 Passkey challenge。
 *
 * @param {PendingPasskeyChallenge} challenge 待处理 challenge。
 * @return {PendingPasskeyChallenge} 规范化 challenge。
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
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
 */
function isPasskeyChallengePurpose(
  value: unknown,
): value is PasskeyChallengePurpose {
  return value === "passkey_registration" || value === "primary_login" ||
    value === "reauth" || value === "second_factor";
}

/**
 * 从 SQL 结果行转换登录失败状态。
 *
 * @param {Row | undefined} row SQL 结果行。
 * @return {LoginFailure | undefined} 登录失败状态。
 */
function loginFailureFromRow(row: Row | undefined): LoginFailure | undefined {
  if (!row) {
    return undefined;
  }
  return {
    failures: numberValue(row.failures),
    lockedUntil: stringValue(row.locked_until),
  };
}

/**
 * 规范化批量记录 ID。
 *
 * @param {string[]} ids 原始记录 ID。
 * @return {string[]} 去重后的非空记录 ID。
 */
function normalizedIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

/**
 * 创建稳定复合实体键。
 *
 * @param {...string[]} parts 实体键片段。
 * @return {string} JSON 编码后的稳定键。
 */
function entityKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

/**
 * 创建 SQL 参数占位符。
 *
 * @param {number} count 占位符数量。
 * @return {string} 逗号分隔的占位符。
 */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * 创建清除墓碑的 SQL 语句。
 *
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @return {InStatement} SQL 语句。
 */
function clearTombstoneStatement(
  entityType: string,
  entityKey: string,
): InStatement {
  return {
    sql: `DELETE FROM storage_tombstones
      WHERE entity_type = ? AND entity_key = ?`,
    args: [entityType, entityKey],
  };
}

/**
 * 创建墓碑 UPSERT 语句。
 *
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @param {string} deletedAt 删除时间。
 * @return {InStatement} SQL 语句。
 */
function tombstoneStatement(
  entityType: string,
  entityKey: string,
  deletedAt: string,
): InStatement {
  return {
    sql: `INSERT INTO storage_tombstones
        (entity_type, entity_key, deleted_at)
      VALUES (?, ?, ?)
      ON CONFLICT(entity_type, entity_key) DO UPDATE SET
        deleted_at = excluded.deleted_at`,
    args: [entityType, entityKey, deletedAt],
  };
}

/**
 * 创建实时变更标记 UPSERT 语句。
 *
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @param {boolean} onlyIfChanged 是否仅在上一条语句实际修改数据时记录。
 * @return {InStatement} SQL 语句。
 */
function mutationStatement(
  entityType: string,
  entityKey: string,
  onlyIfChanged = false,
): InStatement {
  return {
    sql: `INSERT INTO storage_mutations
        (entity_type, entity_key, mutated_at)
      SELECT ?, ?, ?
      ${onlyIfChanged ? "WHERE changes() > 0" : ""}
      ON CONFLICT(entity_type, entity_key) DO UPDATE SET
        mutated_at = excluded.mutated_at`,
    args: [entityType, entityKey, new Date().toISOString()],
  };
}

/**
 * 创建原子声明 KV 回填权的 SQL 语句。
 *
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @return {InStatement} SQL 语句。
 */
function claimKvImportStatement(
  entityType: string,
  entityKey: string,
): InStatement {
  return {
    sql: `INSERT OR IGNORE INTO storage_mutations
        (entity_type, entity_key, mutated_at)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM storage_mutations
        WHERE entity_type = ? AND entity_key = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM storage_tombstones
        WHERE entity_type = ? AND entity_key = ?
      )`,
    args: [
      entityType,
      entityKey,
      new Date().toISOString(),
      entityType,
      entityKey,
      entityType,
      entityKey,
    ],
  };
}

/**
 * 创建 KV 实体因实时变更而不能回填的内部错误。
 *
 * @return {Error} 带稳定名称的内部错误。
 */
function kvImportBlockedError(): Error {
  const error = new Error("KV import was blocked by a newer mutation.");
  error.name = "KvImportBlockedError";
  return error;
}

/**
 * 判断错误是否为 KV 回填保护约束错误。
 *
 * @param {unknown} error 捕获到的错误。
 * @return {boolean} 是否为回填保护约束错误。
 */
function isImportGuardConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { message?: unknown; statementIndex?: unknown };
  return candidate.statementIndex === 2 ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("storage_import_allowed"));
}

/**
 * 判断错误是否表示 KV 实体已被实时变更阻止回填。
 *
 * @param {unknown} error 捕获到的错误。
 * @return {boolean} 是否为回填被阻止错误。
 */
export function isKvImportBlockedError(error: unknown): boolean {
  return error instanceof Error && error.name === "KvImportBlockedError";
}

/**
 * 判断错误是否为 SQLite 唯一性或主键约束错误。
 *
 * @param {unknown} error 捕获到的错误。
 * @return {boolean} 是否为约束错误。
 */
function isConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  return (typeof candidate.code === "string" &&
    candidate.code.includes("CONSTRAINT")) ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("constraint"));
}
