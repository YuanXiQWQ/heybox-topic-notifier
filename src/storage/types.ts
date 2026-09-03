/**
 * @file 本文件定义与具体数据库实现无关的应用存储契约。
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
  MatchRecord,
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

/**
 * 登录失败计数及锁定状态。
 */
export type LoginFailure = {
  failures: number;
  lockedUntil?: string;
};

/**
 * 频率限制命中结果。
 */
export type RateLimitHit = {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: string;
  retryAfterSeconds: number;
};

/**
 * 指定用户作用域下的数据存储契约。
 */
export type UserStorage = {
  /**
   * 获取当前用户设置。
   *
   * @return {Promise<AppSettings>} 规范化后的应用设置。
   */
  getSettings(): Promise<AppSettings>;
  /**
   * 保存当前用户设置。
   *
   * @param {AppSettings} settings 应用设置。
   */
  saveSettings(settings: AppSettings): Promise<void>;
  /**
   * 获取当前用户应用状态。
   *
   * @return {Promise<AppState>} 应用状态。
   */
  getAppState(): Promise<AppState>;
  /**
   * 获取当前用户最后轮询时间。
   *
   * @return {Promise<string | undefined>} 最后轮询时间，不存在时返回 undefined。
   */
  getLastPollAt(): Promise<string | undefined>;
  /**
   * 获取当前用户仪表盘快照。
   *
   * @return {Promise<DashboardSnapshot>} 仪表盘快照。
   */
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  /**
   * 列出当前用户历史命中记录。
   *
   * @return {Promise<MatchRecord[]>} 历史命中记录。
   */
  listHistory(): Promise<MatchRecord[]>;
  /**
   * 列出当前用户未完成的命中记录。
   *
   * @return {Promise<MatchRecord[]>} 未完成的命中记录。
   */
  listPendingMatches(): Promise<MatchRecord[]>;
  /**
   * 保存当前用户命中记录。
   *
   * @param {MatchRecord} record 命中记录。
   */
  saveMatch(record: MatchRecord): Promise<void>;
  /**
   * 标记当前用户命中记录已经通知。
   *
   * @param {string} id 命中记录 ID。
   * @param {string} notifiedAt 通知时间。
   */
  markMatchNotified(id: string, notifiedAt: string): Promise<void>;
  /**
   * 批量完成当前用户命中记录。
   *
   * @param {string[]} ids 命中记录 ID 列表。
   */
  completeMatches(ids: string[]): Promise<void>;
  /**
   * 批量删除当前用户命中记录。
   *
   * @param {string[]} ids 命中记录 ID 列表。
   */
  deleteMatches(ids: string[]): Promise<void>;
  /**
   * 保存当前用户最后轮询时间。
   *
   * @param {string} value ISO 格式轮询时间。
   */
  setLastPollAt(value: string): Promise<void>;
};

/**
 * 应用完整数据存储契约。
 */
export type Storage = UserStorage & {
  /**
   * 创建指定用户作用域的存储操作集合。
   *
   * @param {string} userId 用户 ID。
   * @return {UserStorage} 指定用户作用域的存储操作集合。
   */
  forUser(userId: string): UserStorage;
  /**
   * 按账号 ID 获取账号。
   *
   * @param {string} id 账号 ID。
   * @return {Promise<UserAccount | undefined>} 账号信息，不存在时返回 undefined。
   */
  getAccountById(id: string): Promise<UserAccount | undefined>;
  /**
   * 按用户名获取账号。
   *
   * @param {string} username 用户名。
   * @return {Promise<UserAccount | undefined>} 账号信息，不存在时返回 undefined。
   */
  getAccountByUsername(username: string): Promise<UserAccount | undefined>;
  /**
   * 列出全部账号。
   *
   * @return {Promise<UserAccount[]>} 账号列表。
   */
  listAccounts(): Promise<UserAccount[]>;
  /**
   * 保存账号信息。
   *
   * @param {UserAccount} account 账号信息。
   */
  saveAccount(account: UserAccount): Promise<void>;
  /**
   * 原子创建账号。
   *
   * @param {UserAccount} account 账号信息。
   * @return {Promise<boolean>} 创建成功时返回 true。
   */
  createAccount(account: UserAccount): Promise<boolean>;
  /**
   * 原子更新账号。
   *
   * @param {UserAccount} account 账号信息。
   * @return {Promise<boolean>} 更新成功时返回 true。
   */
  updateAccount(account: UserAccount): Promise<boolean>;
  /**
   * 获取用户安全设置。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<UserSecuritySettings>} 用户安全设置。
   */
  getUserSecuritySettings(userId: string): Promise<UserSecuritySettings>;
  /**
   * 保存用户安全设置。
   *
   * @param {UserSecuritySettings} settings 用户安全设置。
   */
  saveUserSecuritySettings(settings: UserSecuritySettings): Promise<void>;
  /**
   * 获取指定用途的认证事件。
   *
   * @param {string} userId 用户 ID。
   * @param {AuthenticationEventPurpose} purpose 认证用途。
   * @return {Promise<AuthenticationEvent | undefined>} 认证事件，不存在时返回 undefined。
   */
  getAuthenticationEvent(
    userId: string,
    purpose: AuthenticationEventPurpose,
  ): Promise<AuthenticationEvent | undefined>;
  /**
   * 原子消费指定用途的认证事件。
   *
   * @param {string} userId 用户 ID。
   * @param {AuthenticationEventPurpose} purpose 认证用途。
   * @return {Promise<AuthenticationEvent | undefined>} 成功消费的认证事件。
   */
  consumeAuthenticationEvent(
    userId: string,
    purpose: AuthenticationEventPurpose,
  ): Promise<AuthenticationEvent | undefined>;
  /**
   * 保存认证事件。
   *
   * @param {AuthenticationEvent} event 认证事件。
   */
  saveAuthenticationEvent(event: AuthenticationEvent): Promise<void>;
  /**
   * 获取密码凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<PasswordCredential | undefined>} 密码凭证，不存在时返回 undefined。
   */
  getPasswordCredential(
    userId: string,
  ): Promise<PasswordCredential | undefined>;
  /**
   * 保存密码凭证。
   *
   * @param {PasswordCredential} credential 密码凭证。
   */
  savePasswordCredential(credential: PasswordCredential): Promise<void>;
  /**
   * 获取首个 TOTP 凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<TotpCredential | undefined>} TOTP 凭证，不存在时返回 undefined。
   */
  getTotpCredential(userId: string): Promise<TotpCredential | undefined>;
  /**
   * 列出 TOTP 凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<TotpCredential[]>} TOTP 凭证列表。
   */
  listTotpCredentials(userId: string): Promise<TotpCredential[]>;
  /**
   * 保存 TOTP 凭证。
   *
   * @param {TotpCredential} credential TOTP 凭证。
   */
  saveTotpCredential(credential: TotpCredential): Promise<void>;
  /**
   * 删除 TOTP 凭证。
   *
   * @param {string} userId 用户 ID。
   * @param {string | undefined} credentialId 凭证 ID。
   */
  deleteTotpCredential(userId: string, credentialId?: string): Promise<void>;
  /**
   * 获取 Passkey 凭证。
   *
   * @param {string} userId 用户 ID。
   * @param {string} credentialId 凭证 ID。
   * @return {Promise<PasskeyCredential | undefined>} Passkey 凭证，不存在时返回 undefined。
   */
  getPasskeyCredential(
    userId: string,
    credentialId: string,
  ): Promise<PasskeyCredential | undefined>;
  /**
   * 列出 Passkey 凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<PasskeyCredential[]>} Passkey 凭证列表。
   */
  listPasskeyCredentials(userId: string): Promise<PasskeyCredential[]>;
  /**
   * 按凭证 ID 反查 Passkey 凭证。
   *
   * @param {string} credentialId 凭证 ID。
   * @return {Promise<PasskeyCredential | undefined>} Passkey 凭证，不存在时返回 undefined。
   */
  getPasskeyCredentialByCredentialId(
    credentialId: string,
  ): Promise<PasskeyCredential | undefined>;
  /**
   * 保存 Passkey 凭证。
   *
   * @param {PasskeyCredential} credential Passkey 凭证。
   */
  savePasskeyCredential(credential: PasskeyCredential): Promise<void>;
  /**
   * 删除 Passkey 凭证。
   *
   * @param {string} userId 用户 ID。
   * @param {string} credentialId 凭证 ID。
   */
  deletePasskeyCredential(userId: string, credentialId: string): Promise<void>;
  /**
   * 获取身份绑定。
   *
   * @param {AuthIdentityProvider} provider 身份提供方。
   * @param {string} providerUserId 提供方用户 ID。
   * @return {Promise<AuthIdentity | undefined>} 身份绑定，不存在时返回 undefined。
   */
  getAuthIdentity(
    provider: AuthIdentityProvider,
    providerUserId: string,
  ): Promise<AuthIdentity | undefined>;
  /**
   * 列出用户在指定提供方的身份绑定。
   *
   * @param {AuthIdentityProvider} provider 身份提供方。
   * @param {string} userId 用户 ID。
   * @return {Promise<AuthIdentity[]>} 身份绑定列表。
   */
  listAuthIdentitiesForUser(
    provider: AuthIdentityProvider,
    userId: string,
  ): Promise<AuthIdentity[]>;
  /**
   * 保存身份绑定。
   *
   * @param {AuthIdentity} identity 身份绑定。
   */
  saveAuthIdentity(identity: AuthIdentity): Promise<void>;
  /**
   * 删除身份绑定。
   *
   * @param {AuthIdentityProvider} provider 身份提供方。
   * @param {string} providerUserId 提供方用户 ID。
   */
  deleteAuthIdentity(
    provider: AuthIdentityProvider,
    providerUserId: string,
  ): Promise<void>;
  /**
   * 获取邮箱凭证。
   *
   * @param {string} userId 用户 ID。
   * @param {string} email 邮箱地址。
   * @return {Promise<EmailCredential | undefined>} 邮箱凭证，不存在时返回 undefined。
   */
  getEmailCredential(
    userId: string,
    email: string,
  ): Promise<EmailCredential | undefined>;
  /**
   * 列出邮箱凭证。
   *
   * @param {string} userId 用户 ID。
   * @return {Promise<EmailCredential[]>} 邮箱凭证列表。
   */
  listEmailCredentials(userId: string): Promise<EmailCredential[]>;
  /**
   * 保存邮箱凭证。
   *
   * @param {EmailCredential} credential 邮箱凭证。
   */
  saveEmailCredential(credential: EmailCredential): Promise<void>;
  /**
   * 删除邮箱凭证。
   *
   * @param {string} userId 用户 ID。
   * @param {string} email 邮箱地址。
   */
  deleteEmailCredential(userId: string, email: string): Promise<void>;
  /**
   * 获取待处理邮箱验证。
   *
   * @param {string} id 验证 ID。
   * @return {Promise<PendingEmailVerification | undefined>} 待处理邮箱验证。
   */
  getPendingEmailVerification(
    id: string,
  ): Promise<PendingEmailVerification | undefined>;
  /**
   * 保存待处理邮箱验证。
   *
   * @param {PendingEmailVerification} verification 待处理邮箱验证。
   */
  savePendingEmailVerification(
    verification: PendingEmailVerification,
  ): Promise<void>;
  /**
   * 删除待处理邮箱验证。
   *
   * @param {string} id 验证 ID。
   */
  deletePendingEmailVerification(id: string): Promise<void>;
  /**
   * 获取待处理 MFA challenge。
   *
   * @param {string} id challenge ID。
   * @return {Promise<PendingMfaChallenge | undefined>} 待处理 MFA challenge。
   */
  getPendingMfaChallenge(id: string): Promise<PendingMfaChallenge | undefined>;
  /**
   * 保存待处理 MFA challenge。
   *
   * @param {PendingMfaChallenge} challenge 待处理 MFA challenge。
   */
  savePendingMfaChallenge(challenge: PendingMfaChallenge): Promise<void>;
  /**
   * 删除待处理 MFA challenge。
   *
   * @param {string} id challenge ID。
   */
  deletePendingMfaChallenge(id: string): Promise<void>;
  /**
   * 获取待处理 Passkey challenge。
   *
   * @param {string} id challenge ID。
   * @return {Promise<PendingPasskeyChallenge | undefined>} 待处理 Passkey challenge。
   */
  getPendingPasskeyChallenge(
    id: string,
  ): Promise<PendingPasskeyChallenge | undefined>;
  /**
   * 保存待处理 Passkey challenge。
   *
   * @param {PendingPasskeyChallenge} challenge 待处理 Passkey challenge。
   */
  savePendingPasskeyChallenge(
    challenge: PendingPasskeyChallenge,
  ): Promise<void>;
  /**
   * 删除待处理 Passkey challenge。
   *
   * @param {string} id challenge ID。
   */
  deletePendingPasskeyChallenge(id: string): Promise<void>;
  /**
   * 获取等待展示的恢复码。
   *
   * @param {string} id 记录 ID。
   * @return {Promise<PendingRecoveryCodeReveal | undefined>} 等待展示的恢复码。
   */
  getPendingRecoveryCodeReveal(
    id: string,
  ): Promise<PendingRecoveryCodeReveal | undefined>;
  /**
   * 保存等待展示的恢复码。
   *
   * @param {PendingRecoveryCodeReveal} reveal 等待展示的恢复码。
   */
  savePendingRecoveryCodeReveal(
    reveal: PendingRecoveryCodeReveal,
  ): Promise<void>;
  /**
   * 删除等待展示的恢复码。
   *
   * @param {string} id 记录 ID。
   */
  deletePendingRecoveryCodeReveal(id: string): Promise<void>;
  /**
   * 获取登录失败状态。
   *
   * @param {string} username 用户名或登录标识。
   * @return {Promise<LoginFailure | undefined>} 登录失败状态。
   */
  getLoginFailure(username: string): Promise<LoginFailure | undefined>;
  /**
   * 原子记录登录失败。
   *
   * @param {string} username 用户名或登录标识。
   * @param {number} maxFailures 最大失败次数。
   * @param {number} lockoutMs 锁定时长。
   * @return {Promise<LoginFailure>} 更新后的登录失败状态。
   */
  recordLoginFailure(
    username: string,
    maxFailures: number,
    lockoutMs: number,
  ): Promise<LoginFailure>;
  /**
   * 清除登录失败状态。
   *
   * @param {string} username 用户名或登录标识。
   */
  clearLoginFailures(username: string): Promise<void>;
  /**
   * 原子记录频率限制命中。
   *
   * @param {readonly string[]} keyParts 频率限制键片段。
   * @param {number} limit 窗口内最大次数。
   * @param {number} windowMs 窗口时长。
   * @return {Promise<RateLimitHit>} 频率限制命中结果。
   */
  recordRateLimitHit(
    keyParts: readonly string[],
    limit: number,
    windowMs: number,
  ): Promise<RateLimitHit>;
  /**
   * 获取登录会话。
   *
   * @param {string} tokenHash 会话令牌哈希。
   * @return {Promise<UserSession | undefined>} 登录会话，不存在时返回 undefined。
   */
  getSession(tokenHash: string): Promise<UserSession | undefined>;
  /**
   * 保存登录会话。
   *
   * @param {UserSession} session 登录会话。
   */
  saveSession(session: UserSession): Promise<void>;
  /**
   * 删除登录会话。
   *
   * @param {string} tokenHash 会话令牌哈希。
   */
  deleteSession(tokenHash: string): Promise<void>;
};
