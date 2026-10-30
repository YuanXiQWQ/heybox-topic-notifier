/**
 * @file 本文件定义 Turso 数据库的版本化表结构和索引。
 */
import type { InStatement } from "@libsql/client";

/**
 * 当前 Turso schema 版本。
 */
export const TURSO_SCHEMA_VERSION = 10;
/** 具备稳定游标和事件唯一键的原生通知收件箱。 */
const nativeNotificationSchema = [
  `CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, value_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_temporary (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, value_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS admin_temporary_expiry ON admin_temporary(expires_at)`,
  `CREATE TABLE IF NOT EXISTS administration_guard (ok INTEGER NOT NULL CHECK(ok=1))`,
  `CREATE TABLE IF NOT EXISTS deleted_accounts (id TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS registration_emails (email TEXT PRIMARY KEY, user_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS native_push_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, value_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS native_push_devices_user_idx ON native_push_devices(user_id)`,
  `CREATE TABLE IF NOT EXISTS native_login (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL, user_id TEXT, consumed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS native_notifications (user_id TEXT NOT NULL, id TEXT NOT NULL, cursor TEXT NOT NULL, created_at INTEGER NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE INDEX IF NOT EXISTS native_notifications_cursor ON native_notifications(user_id, cursor)`,
];

/**
 * 为仪表盘数据表创建版本更新触发器；版本与业务写入处于同一事务。
 *
 * @param {string} table 受监控的内部表名。
 * @return {string[]} 插入、更新和删除触发器语句。
 */
function dashboardVersionTriggers(table: string): string[] {
  return ["INSERT", "UPDATE", "DELETE"].map((operation) => {
    const row = operation === "DELETE" ? "OLD" : "NEW";
    return `CREATE TRIGGER IF NOT EXISTS ${table}_dashboard_${operation.toLowerCase()}
      AFTER ${operation} ON ${table}
      BEGIN
        INSERT INTO dashboard_versions (user_id, version)
          VALUES (${row}.user_id, lower(hex(randomblob(16))))
          ON CONFLICT(user_id) DO UPDATE SET version = excluded.version;
      END`;
  });
}

/**
 * 当前 Turso schema 的可重复执行迁移语句。
 *
 * 业务对象保留 JSON 原文以兼容当前 TypeScript 数据结构，同时将查询、唯一性和
 * TTL 所需字段提升为关系列，避免把原有 KV prefix scan 原样搬到 SQL。
 */
export const TURSO_SCHEMA_STATEMENTS: InStatement[] = [
  `CREATE TABLE IF NOT EXISTS sync_settings (user_id TEXT PRIMARY KEY, revision TEXT NOT NULL, value_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_records (user_id TEXT NOT NULL, id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE TABLE IF NOT EXISTS sync_transaction_guard (id INTEGER PRIMARY KEY CONSTRAINT sync_guard_valid CHECK (id = 1))`,
  `CREATE TABLE IF NOT EXISTS web_push_devices (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS web_push_devices_user_idx ON web_push_devices (user_id)`,
  `CREATE TABLE IF NOT EXISTS matching_runtime (
    user_id TEXT PRIMARY KEY, value_json TEXT, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS matching_activity (
    user_id TEXT NOT NULL, topic_id TEXT NOT NULL, last_seen_at INTEGER NOT NULL,
    value_json TEXT NOT NULL, PRIMARY KEY (user_id, topic_id)
  )`,
  `CREATE TABLE IF NOT EXISTS matching_cache (
    user_id TEXT NOT NULL, cache_key TEXT NOT NULL, topic_id TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    pending INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
    value_json TEXT NOT NULL, PRIMARY KEY (user_id, cache_key)
  )`,
  `CREATE INDEX IF NOT EXISTS matching_cache_recency ON matching_cache(user_id, last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS matching_cache_pending ON matching_cache(user_id, topic_id, pending, retry_at)`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_avatars (
    user_id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    data_blob BLOB NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_states (
    user_id TEXT PRIMARY KEY,
    last_poll_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    matched_at TEXT NOT NULL,
    post_published_at TEXT NOT NULL,
    completed_at TEXT,
    notified_at TEXT,
    value_json TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  "DROP INDEX IF EXISTS matches_user_history_idx",
  `CREATE INDEX matches_user_history_idx
    ON matches (user_id, matched_at DESC, id ASC)`,
  "DROP INDEX IF EXISTS matches_user_pending_idx",
  `CREATE INDEX matches_user_pending_idx
    ON matches (user_id, completed_at, post_published_at DESC, matched_at DESC, id ASC)`,
  `CREATE INDEX IF NOT EXISTS matches_user_post_idx
    ON matches (user_id, json_extract(value_json, '$.post.id'))`,
  `CREATE TABLE IF NOT EXISTS dashboard_versions (
    user_id TEXT PRIMARY KEY,
    version TEXT NOT NULL
  )`,
  ...dashboardVersionTriggers("matches"),
  ...dashboardVersionTriggers("user_settings"),
  ...dashboardVersionTriggers("app_states"),
  `CREATE TABLE IF NOT EXISTS password_credentials (
    user_id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS totp_credentials (
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    enabled_at TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (user_id, credential_id)
  )`,
  `CREATE INDEX IF NOT EXISTS totp_credentials_user_idx
    ON totp_credentials (user_id, enabled_at, credential_id)`,
  `CREATE TABLE IF NOT EXISTS passkey_credentials (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS passkey_credentials_user_idx
    ON passkey_credentials (user_id, created_at, credential_id)`,
  `CREATE TABLE IF NOT EXISTS auth_identities (
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (provider, provider_user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS auth_identities_user_idx
    ON auth_identities (provider, user_id, created_at, provider_user_id)`,
  `CREATE TABLE IF NOT EXISTS email_credentials (
    user_id TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    created_at TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (user_id, email_normalized)
  )`,
  `CREATE INDEX IF NOT EXISTS email_credentials_user_idx
    ON email_credentials (user_id, email_normalized)`,
  `CREATE TABLE IF NOT EXISTS user_security_settings (
    user_id TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS authentication_events (
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    authenticated_at TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (user_id, purpose)
  )`,
  `CREATE TABLE IF NOT EXISTS pending_email_verifications (
    id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pending_email_verifications_expiry_idx
    ON pending_email_verifications (expires_at)`,
  `CREATE TABLE IF NOT EXISTS pending_mfa_challenges (
    id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pending_mfa_challenges_expiry_idx
    ON pending_mfa_challenges (expires_at)`,
  `CREATE TABLE IF NOT EXISTS pending_passkey_challenges (
    id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pending_passkey_challenges_expiry_idx
    ON pending_passkey_challenges (expires_at)`,
  `CREATE TABLE IF NOT EXISTS pending_recovery_code_reveals (
    id TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pending_recovery_code_reveals_expiry_idx
    ON pending_recovery_code_reveals (expires_at)`,
  `CREATE TABLE IF NOT EXISTS login_failures (
    username_normalized TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    locked_until TEXT,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_failures_expiry_idx
    ON login_failures (expires_at)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key_json TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx
    ON rate_limits (reset_at)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    value_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx
    ON sessions (expires_at)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx
    ON sessions (user_id, expires_at)`,
  ...nativeNotificationSchema,
  `CREATE TABLE IF NOT EXISTS storage_tombstones (
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_key)
  )`,
  `CREATE TABLE IF NOT EXISTS storage_mutations (
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    mutated_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_key)
  )`,
  `CREATE TABLE IF NOT EXISTS storage_import_guard (
    id INTEGER NOT NULL CONSTRAINT storage_import_allowed CHECK (id = 1)
  )`,
  {
    sql: `INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (?, ?)`,
    args: [TURSO_SCHEMA_VERSION, new Date(0).toISOString()],
  },
];
