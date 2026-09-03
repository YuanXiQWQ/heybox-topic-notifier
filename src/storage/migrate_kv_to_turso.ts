/**
 * @file 本文件提供可重复执行且不会覆盖实时变更的 Deno KV 到 Turso 回填工具。
 */
import type {
  AppSettings,
  AppState,
  AuthenticationEvent,
  AuthIdentity,
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
import { defaultAppSettingsFromEnv } from "../services/app_context.ts";
import {
  createTursoStorage,
  isKvImportBlockedError,
  type TursoStorage,
} from "./turso.ts";

/**
 * 迁移源需要提供的 KV 列表能力。
 */
export type KvMigrationSource = {
  list<T>(
    selector: { prefix: Deno.KvKey },
  ): AsyncIterable<{ key: Deno.KvKey; value: T }>;
};

/**
 * 单个 KV family 的迁移统计。
 */
export type KvMigrationFamilyReport = {
  failed: number;
  imported: number;
  skipped: number;
};

/**
 * KV 到 Turso 的迁移统计。
 */
export type KvMigrationReport = {
  failed: number;
  families: Record<string, KvMigrationFamilyReport>;
  imported: number;
  scanned: number;
  skipped: number;
};

/**
 * 需要扫描的 KV 顶层 family。
 */
const kvFamilies = [
  "accounts",
  "accountUsernames",
  "authenticationEvents",
  "authIdentities",
  "emailCredentials",
  "loginFailures",
  "passkeyCredentialIndex",
  "passkeyCredentials",
  "passwordCredentials",
  "pendingEmailVerifications",
  "pendingMfaChallenges",
  "pendingPasskeyChallenges",
  "pendingRecoveryCodeReveals",
  "rateLimits",
  "securitySettings",
  "sessions",
  "totpCredentials",
  "userData",
] as const;

/**
 * 单条 KV 记录的迁移结果。
 */
type MigrationOutcome = "imported" | "skipped";

/**
 * 将 Deno KV 数据回填到 Turso。
 *
 * 目标中只要存在实时变更标记或删除墓碑，该记录就会跳过。过期 session 和
 * challenge 也会跳过；限流与登录失败属于短期防护状态，不跨数据库回填。
 *
 * @param {KvMigrationSource} source KV 数据源。
 * @param {TursoStorage} target Turso 目标存储。
 * @param {number} now 当前时间戳毫秒数。
 * @return {Promise<KvMigrationReport>} 迁移统计。
 */
export async function migrateKvToTurso(
  source: KvMigrationSource,
  target: TursoStorage,
  now = Date.now(),
): Promise<KvMigrationReport> {
  const report: KvMigrationReport = {
    failed: 0,
    families: {},
    imported: 0,
    scanned: 0,
    skipped: 0,
  };
  for (const family of kvFamilies) {
    const familyReport = report.families[family] = emptyFamilyReport();
    for await (const entry of source.list<unknown>({ prefix: [family] })) {
      report.scanned += 1;
      try {
        const outcome = await migrateKvEntry(entry, target, now);
        report[outcome] += 1;
        familyReport[outcome] += 1;
      } catch {
        report.failed += 1;
        familyReport.failed += 1;
      }
    }
  }
  return report;
}

/**
 * 迁移一条 KV 记录。
 *
 * @param {{key: Deno.KvKey; value: unknown}} entry KV 记录。
 * @param {TursoStorage} target Turso 目标存储。
 * @param {number} now 当前时间戳毫秒数。
 * @return {Promise<MigrationOutcome>} 迁移结果。
 */
async function migrateKvEntry(
  entry: { key: Deno.KvKey; value: unknown },
  target: TursoStorage,
  now: number,
): Promise<MigrationOutcome> {
  const parts = stringKeyParts(entry.key);
  if (!parts) {
    return "skipped";
  }
  const [family, first, second, third] = parts;
  if (family === "accounts" && first && !second) {
    return await importEntity(
      target,
      "account",
      first,
      () => target.saveAccount(entry.value as UserAccount),
    );
  }
  if (family === "userData" && first && second === "settings" && !third) {
    return await importEntity(
      target,
      "settings",
      first,
      () => target.forUser(first).saveSettings(entry.value as AppSettings),
    );
  }
  if (family === "userData" && first && second === "state" && !third) {
    const state = entry.value as AppState;
    return typeof state.lastPollAt === "string"
      ? await importEntity(
        target,
        "state",
        first,
        () => target.forUser(first).setLastPollAt(state.lastPollAt!),
      )
      : "skipped";
  }
  if (family === "userData" && first && second === "matches" && third) {
    return await importEntity(
      target,
      "match",
      entityKey(first, third),
      () => target.forUser(first).saveMatch(entry.value as MatchRecord),
    );
  }
  if (family === "securitySettings" && first && !second) {
    return await importEntity(
      target,
      "security-settings",
      first,
      () =>
        target.saveUserSecuritySettings(entry.value as UserSecuritySettings),
    );
  }
  if (family === "authenticationEvents" && first && second && !third) {
    return await importEntity(
      target,
      "authentication-event",
      entityKey(first, second),
      () => target.saveAuthenticationEvent(entry.value as AuthenticationEvent),
    );
  }
  if (family === "passwordCredentials" && first && !second) {
    return await importEntity(
      target,
      "password-credential",
      first,
      () => target.savePasswordCredential(entry.value as PasswordCredential),
    );
  }
  if (family === "totpCredentials" && first && !third) {
    const credential = entry.value as TotpCredential;
    const credentialId = second ?? credential.credentialId ?? "legacy";
    return await importEntity(
      target,
      "totp-credential",
      entityKey(first, credentialId),
      () => target.saveTotpCredential(credential),
    );
  }
  if (family === "passkeyCredentials" && first && second && !third) {
    return await importEntity(
      target,
      "passkey-credential",
      second,
      () => target.savePasskeyCredential(entry.value as PasskeyCredential),
    );
  }
  if (family === "authIdentities" && first && second && !third) {
    return await importEntity(
      target,
      "auth-identity",
      entityKey(first, second),
      () => target.saveAuthIdentity(entry.value as AuthIdentity),
    );
  }
  if (family === "emailCredentials" && first && second && !third) {
    return await importEntity(
      target,
      "email-credential",
      entityKey(first, second),
      () => target.saveEmailCredential(entry.value as EmailCredential),
    );
  }
  if (family === "pendingEmailVerifications" && first && !second) {
    return await importExpiringEntity(
      target,
      "pending-email-verification",
      first,
      entry.value as PendingEmailVerification,
      now,
      () =>
        target.savePendingEmailVerification(
          entry.value as PendingEmailVerification,
        ),
    );
  }
  if (family === "pendingMfaChallenges" && first && !second) {
    return await importExpiringEntity(
      target,
      "pending-mfa-challenge",
      first,
      entry.value as PendingMfaChallenge,
      now,
      () => target.savePendingMfaChallenge(entry.value as PendingMfaChallenge),
    );
  }
  if (family === "pendingPasskeyChallenges" && first && !second) {
    return await importExpiringEntity(
      target,
      "pending-passkey-challenge",
      first,
      entry.value as PendingPasskeyChallenge,
      now,
      () =>
        target.savePendingPasskeyChallenge(
          entry.value as PendingPasskeyChallenge,
        ),
    );
  }
  if (family === "pendingRecoveryCodeReveals" && first && !second) {
    return await importExpiringEntity(
      target,
      "pending-recovery-code-reveal",
      first,
      entry.value as PendingRecoveryCodeReveal,
      now,
      () =>
        target.savePendingRecoveryCodeReveal(
          entry.value as PendingRecoveryCodeReveal,
        ),
    );
  }
  if (family === "sessions" && first && !second) {
    return await importExpiringEntity(
      target,
      "session",
      first,
      entry.value as UserSession,
      now,
      () => target.saveSession(entry.value as UserSession),
    );
  }
  return "skipped";
}

/**
 * 在迁移保护允许时导入实体。
 *
 * @param {TursoStorage} target Turso 目标存储。
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @param {() => Promise<void>} save 保存操作。
 * @return {Promise<MigrationOutcome>} 迁移结果。
 */
async function importEntity(
  target: TursoStorage,
  entityType: string,
  entityKey: string,
  save: () => Promise<void>,
): Promise<MigrationOutcome> {
  if (!await target.canImportKvEntity(entityType, entityKey)) {
    return "skipped";
  }
  try {
    await save();
  } catch (error) {
    if (isKvImportBlockedError(error)) {
      return "skipped";
    }
    throw error;
  }
  return "imported";
}

/**
 * 在记录尚未过期时导入实体。
 *
 * @param {TursoStorage} target Turso 目标存储。
 * @param {string} entityType 实体类型。
 * @param {string} entityKey 实体键。
 * @param {{expiresAt: string}} value 带过期时间的数据。
 * @param {number} now 当前时间戳毫秒数。
 * @param {() => Promise<void>} save 保存操作。
 * @return {Promise<MigrationOutcome>} 迁移结果。
 */
async function importExpiringEntity(
  target: TursoStorage,
  entityType: string,
  entityKey: string,
  value: { expiresAt: string },
  now: number,
  save: () => Promise<void>,
): Promise<MigrationOutcome> {
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return "skipped";
  }
  return await importEntity(target, entityType, entityKey, save);
}

/**
 * 将 KV key 转换为字符串片段。
 *
 * @param {Deno.KvKey} key KV key。
 * @return {string[] | undefined} 全部为字符串时的 key 片段。
 */
function stringKeyParts(key: Deno.KvKey): string[] | undefined {
  return key.every((part) => typeof part === "string")
    ? key as string[]
    : undefined;
}

/**
 * 创建稳定复合实体键。
 *
 * @param {...string[]} parts 实体键片段。
 * @return {string} JSON 编码后的实体键。
 */
function entityKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

/**
 * 创建空 family 迁移统计。
 *
 * @return {KvMigrationFamilyReport} 空统计。
 */
function emptyFamilyReport(): KvMigrationFamilyReport {
  return { failed: 0, imported: 0, skipped: 0 };
}

/**
 * 从环境变量创建 Turso 迁移目标。
 *
 * @return {TursoStorage} Turso 存储。
 */
function migrationTargetFromEnv(): TursoStorage {
  return createTursoStorage(defaultAppSettingsFromEnv(), {
    authToken: Deno.env.get("TURSO_AUTH_TOKEN"),
    url: Deno.env.get("TURSO_DATABASE_URL"),
    writeMode: "kv-import",
  });
}

if (import.meta.main) {
  const kv = await Deno.openKv();
  try {
    const report = await migrateKvToTurso(kv, migrationTargetFromEnv());
    console.log(JSON.stringify(report, null, 2));
    if (report.failed > 0) {
      Deno.exitCode = 1;
    }
  } finally {
    kv.close();
  }
}
