/**
 * @file 本文件定义 Turso 数据库的版本化表结构和索引。
 */
import type { InStatement } from "@libsql/client";

/**
 * 当前 Turso schema 版本。
 */
export const TURSO_SCHEMA_VERSION = 3;

/**
 * 首版 Turso schema 迁移语句。
 *
 * 业务对象保留 JSON 原文以兼容当前 TypeScript 数据结构，同时将查询、唯一性和
 * TTL 所需字段提升为关系列，避免把原有 KV prefix scan 原样搬到 SQL。
 */
export const TURSO_SCHEMA_STATEMENTS: InStatement[] = [
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
