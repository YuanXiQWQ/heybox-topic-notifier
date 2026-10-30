/** @file Turso 中账号管理与一次性邀请码的事务实现。 */
import type { InStatement, ResultSet } from "@libsql/client";
import { accountRole } from "../auth/roles.ts";
import type {
  AccountCreation,
  AdministrationStore,
  AdminResult,
} from "./administration_types.ts";

/** @param {(statement: InStatement) => Promise<ResultSet>} execute 查询接口。 @param {(statements: InStatement[]) => Promise<ResultSet[]>} batch 写事务接口。 @return {AdministrationStore} 管理存储。 */
export function createTursoAdministration(
  execute: (statement: InStatement) => Promise<ResultSet>,
  batch: (statements: InStatement[]) => Promise<ResultSet[]>,
): AdministrationStore {
  /** @param {InStatement[]} statements 受保护写入。 @return {Promise<AdminResult>} 事务结果。 */
  async function commit(statements: InStatement[]): Promise<AdminResult> {
    try {
      await batch([
        "DELETE FROM administration_guard",
        ...statements,
        "DELETE FROM administration_guard",
      ]);
      return "ok";
    } catch (error) {
      if (/constraint/i.test(String(error))) return "conflict";
      throw error;
    }
  }
  /** @param {string} actor 操作者。 @param {boolean} superOnly 超级管理员限制。 @return {InStatement} 同事务权限校验。 */
  function authorize(actor: string, superOnly = true): InStatement {
    return {
      sql:
        `INSERT INTO administration_guard (ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM user_accounts WHERE id = ? AND json_extract(value_json, '$.role') IN (${
          superOnly ? "'superadmin'" : "'admin','superadmin'"
        })) THEN 1 ELSE 0 END`,
      args: [actor],
    };
  }
  /** @return {InStatement} 上一条条件写入必须影响一行，否则回滚。 */
  function changed(): InStatement {
    return "INSERT INTO administration_guard (ok) VALUES (CASE WHEN changes() = 1 THEN 1 ELSE 0 END)";
  }
  /** @param {AccountCreation} input 账号及凭据。 @param {boolean} privileged 是否为超级管理员直接创建。 @return {InStatement[]} 创建语句。 */
  function creation(
    input: AccountCreation,
    privileged: boolean,
  ): InStatement[] {
    const account = {
      ...input.account,
      role: privileged ? accountRole(input.account) : "user",
      roleVersion: 0,
    };
    const rows: InStatement[] = [
      {
        sql:
          "INSERT INTO administration_guard (ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE id = ?) THEN 0 ELSE 1 END",
        args: [account.id],
      },
      {
        sql:
          "INSERT INTO user_accounts (id,username,username_normalized,created_at,value_json) VALUES (?,?,?,?,?)",
        args: [
          account.id,
          account.username,
          account.username.toLowerCase(),
          account.createdAt,
          JSON.stringify(account),
        ],
      },
    ];
    if (input.password) {
      rows.push({
        sql:
          "INSERT INTO password_credentials (user_id,updated_at,value_json) VALUES (?,?,?)",
        args: [
          account.id,
          input.password.updatedAt,
          JSON.stringify(input.password),
        ],
      });
    }
    if (input.email) {
      if (!input.identity) {
        rows.push({
          sql: "INSERT INTO registration_emails (email,user_id) VALUES (?,?)",
          args: [input.email.email.toLowerCase(), account.id],
        });
      }
      rows.push({
        sql:
          "INSERT INTO email_credentials (user_id,email_normalized,created_at,value_json) VALUES (?,?,?,?)",
        args: [
          account.id,
          input.email.email.toLowerCase(),
          input.email.createdAt,
          JSON.stringify(input.email),
        ],
      });
    }
    if (input.identity) {
      rows.push({
        sql:
          "INSERT INTO auth_identities (provider,provider_user_id,user_id,created_at,value_json) VALUES (?,?,?,?,?)",
        args: [
          input.identity.provider,
          input.identity.providerUserId,
          account.id,
          input.identity.createdAt,
          JSON.stringify(input.identity),
        ],
      });
    }
    rows.push({
      sql:
        "INSERT OR REPLACE INTO storage_mutations (entity_type,entity_key,mutated_at) VALUES ('account',?,?)",
      args: [account.id, new Date().toISOString()],
    });
    return rows;
  }
  return {
    /** @param {import("./administration_types.ts").AdministrationSnapshot} snapshot 权威提交结果；禁止旧版本恢复权限或已删除账号。 */
    async applySnapshot(snapshot) {
      const rows: InStatement[] = [];
      if (snapshot.deletedId) {
        rows.push({
          sql: "DELETE FROM user_accounts WHERE id=?",
          args: [snapshot.deletedId],
        }, {
          sql: "INSERT OR IGNORE INTO deleted_accounts (id) VALUES (?)",
          args: [snapshot.deletedId],
        }, {
          sql:
            "INSERT OR REPLACE INTO storage_tombstones (entity_type,entity_key,deleted_at) VALUES ('account',?,?)",
          args: [snapshot.deletedId, new Date().toISOString()],
        });
        for (
          const table of [
            "user_avatars",
            "user_settings",
            "app_states",
            "matches",
            "sync_records",
            "sync_settings",
            "dashboard_versions",
            "password_credentials",
            "totp_credentials",
            "passkey_credentials",
            "auth_identities",
            "email_credentials",
            "user_security_settings",
            "authentication_events",
            "sessions",
            "native_login",
            "native_notifications",
            "native_push_devices",
            "web_push_devices",
            "matching_runtime",
            "matching_activity",
            "matching_cache",
            "registration_emails",
          ]
        ) {
          rows.push({
            sql: "DELETE FROM " + table + " WHERE user_id=?",
            args: [snapshot.deletedId],
          });
        }
        for (
          const table of [
            "pending_email_verifications",
            "pending_mfa_challenges",
            "pending_passkey_challenges",
            "pending_recovery_code_reveals",
            "admin_temporary",
          ]
        ) {
          rows.push({
            sql: "DELETE FROM " + table +
              " WHERE json_extract(value_json,'$.userId')=?",
            args: [snapshot.deletedId],
          });
        }
      }
      if (snapshot.creation) {
        const input = snapshot.creation, a = input.account;
        rows.push({
          sql:
            "INSERT INTO user_accounts (id,username,username_normalized,created_at,value_json) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM deleted_accounts WHERE id=?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,username_normalized=excluded.username_normalized,value_json=excluded.value_json WHERE COALESCE(json_extract(user_accounts.value_json,'$.roleVersion'),0)<=COALESCE(json_extract(excluded.value_json,'$.roleVersion'),0)",
          args: [
            a.id,
            a.username,
            a.username.toLowerCase(),
            a.createdAt,
            JSON.stringify(a),
            a.id,
          ],
        });
        for (const statement of creation(input, true).slice(2, -1)) {
          if (
            typeof statement === "object" && !Array.isArray(statement) &&
            statement.sql.startsWith("INSERT INTO")
          ) {
            rows.push({
              ...statement,
              sql: statement.sql.replace("INSERT INTO", "INSERT OR IGNORE INTO")
                .replace(
                  /VALUES \(([^)]+)\)$/,
                  "SELECT $1 WHERE EXISTS (SELECT 1 FROM user_accounts WHERE id=?)",
                ),
              args: [
                ...statement.args as import("@libsql/client").InValue[],
                a.id,
              ],
            });
          }
        }
        rows.push({
          sql:
            "INSERT OR REPLACE INTO storage_mutations (entity_type,entity_key,mutated_at) VALUES ('account',?,?)",
          args: [a.id, new Date().toISOString()],
        });
      }
      for (const value of snapshot.invitations ?? []) {
        rows.push({
          sql:
            "INSERT INTO invitations (id,created_at,value_json) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json WHERE json_extract(invitations.value_json,'$.usedAt') IS NULL AND json_extract(invitations.value_json,'$.revokedAt') IS NULL",
          args: [value.id, value.createdAt, JSON.stringify(value)],
        });
      }
      if (rows.length) await batch(rows);
    },
    /** @return {Promise<Invitation[]>} 邀请记录。 */
    async listInvitations() {
      return (await execute(
        "SELECT value_json FROM invitations ORDER BY created_at DESC",
      )).rows.map((row) => JSON.parse(String(row.value_json)));
    },
    /** @param {string} actor 操作者。 @param {Invitation[]} invitations 邀请记录。 @return {Promise<AdminResult>} 结果。 */
    issue(actor, invitations) {
      return commit([
        authorize(actor, false),
        ...invitations.map((value) => ({
          sql:
            "INSERT INTO invitations (id,created_at,value_json) VALUES (?,?,?)",
          args: [value.id, value.createdAt, JSON.stringify(value)],
        })),
      ]);
    },
    /** @param {string} actor 操作者。 @param {string} id 邀请摘要。 @return {Promise<AdminResult>} 结果。 */
    revoke(actor, id) {
      return commit([authorize(actor, false), {
        sql:
          "UPDATE invitations SET value_json=json_set(value_json,'$.revokedAt',?) WHERE id=? AND json_extract(value_json,'$.usedAt') IS NULL AND json_extract(value_json,'$.revokedAt') IS NULL",
        args: [new Date().toISOString(), id],
      }, changed()]);
    },
    /** @param {AccountCreation} input 账号资料。 @param {string} invitation 邀请摘要。 @param {string} pending 注册事务。 @return {Promise<AdminResult>} 结果。 */
    async register(input, invitation, pending) {
      const now = new Date().toISOString();
      const rows: InStatement[] = [{
        sql:
          "UPDATE invitations SET value_json=json_set(value_json,'$.usedAt',?,'$.usedBy',?) WHERE id=? AND json_extract(value_json,'$.usedAt') IS NULL AND json_extract(value_json,'$.revokedAt') IS NULL AND (json_extract(value_json,'$.expiresAt') IS NULL OR json_extract(value_json,'$.expiresAt') > ?)",
        args: [now, input.account.id, invitation, now],
      }, changed()];
      if (pending) {
        rows.push({
          sql:
            "DELETE FROM admin_temporary WHERE id=? AND expires_at>? AND json_extract(value_json,'$.creation.account.id')=?",
          args: [pending, now, input.account.id],
        }, changed());
      }
      rows.push(...creation(input, false));
      return await commit(rows);
    },
    /** @param {string} actor 超级管理员。 @param {AccountCreation} input 账号资料。 @return {Promise<AdminResult>} 结果。 */
    createUser(actor, input) {
      return commit([authorize(actor), ...creation(input, true)]);
    },
    /** @param {string} actor 超级管理员。 @param {import("./administration_types.ts").AccountEdit} input 白名单字段。 @return {Promise<AdminResult>} 结果。 */
    editUser(actor, input) {
      if (actor === input.id && input.role !== "superadmin") {
        return Promise.resolve("forbidden");
      }
      return commit([
        authorize(actor),
        {
          sql:
            `UPDATE user_accounts SET username=?,username_normalized=?,value_json=json_set(value_json,'$.username',?,'$.displayName',?,'$.displayNameFromGoogle',json('false'),'$.role',?,'$.roleVersion',?) WHERE id=? AND COALESCE(json_extract(value_json,'$.roleVersion'),0)=?`,
          args: [
            input.username,
            input.username.toLowerCase(),
            input.username,
            input.displayName ?? "",
            accountRole(input),
            (input.roleVersion ?? 0) + 1,
            input.id,
            input.roleVersion ?? 0,
          ],
        },
        changed(),
        {
          sql:
            "INSERT OR REPLACE INTO storage_mutations (entity_type,entity_key,mutated_at) VALUES ('account',?,?)",
          args: [input.id, new Date().toISOString()],
        },
      ]);
    },
    /** @param {string} actor 超级管理员。 @param {string} id 目标账号。 @param {number} version 表单版本。 @return {Promise<AdminResult>} 结果。 */
    deleteUser(actor, id, version) {
      if (actor === id) return Promise.resolve("forbidden");
      const rows: InStatement[] = [
        authorize(actor),
        {
          sql:
            "DELETE FROM user_accounts WHERE id=? AND COALESCE(json_extract(value_json,'$.roleVersion'),0)=?",
          args: [id, version],
        },
        changed(),
        { sql: "INSERT INTO deleted_accounts (id) VALUES (?)", args: [id] },
        {
          sql:
            "INSERT OR REPLACE INTO storage_tombstones (entity_type,entity_key,deleted_at) VALUES ('account',?,?)",
          args: [id, new Date().toISOString()],
        },
      ];
      for (
        const table of [
          "user_avatars",
          "user_settings",
          "app_states",
          "matches",
          "sync_records",
          "sync_settings",
          "dashboard_versions",
          "password_credentials",
          "totp_credentials",
          "passkey_credentials",
          "auth_identities",
          "email_credentials",
          "user_security_settings",
          "authentication_events",
          "sessions",
          "native_login",
          "native_notifications",
          "native_push_devices",
          "web_push_devices",
          "matching_runtime",
          "matching_activity",
          "matching_cache",
          "registration_emails",
        ]
      ) rows.push({ sql: `DELETE FROM ${table} WHERE user_id=?`, args: [id] });
      for (
        const table of [
          "pending_email_verifications",
          "pending_mfa_challenges",
          "pending_passkey_challenges",
          "pending_recovery_code_reveals",
          "admin_temporary",
        ]
      ) {
        rows.push({
          sql:
            `DELETE FROM ${table} WHERE json_extract(value_json,'$.userId')=?`,
          args: [id],
        });
      }
      return commit(rows);
    },
    /** @param {AdminTemporary} value 短期身份或授权。 */
    async putTemporary(value) {
      await batch([{
        sql: "DELETE FROM admin_temporary WHERE expires_at<=?",
        args: [new Date().toISOString()],
      }, {
        sql:
          "INSERT OR REPLACE INTO admin_temporary (id,expires_at,value_json) VALUES (?,?,?)",
        args: [value.id, value.expiresAt, JSON.stringify(value)],
      }]);
    },
    /** @param {string} id 摘要。 @return {Promise<AdminTemporary | undefined>} 有效记录。 */
    async getTemporary(id) {
      const row = (await execute({
        sql:
          "SELECT value_json FROM admin_temporary WHERE id=? AND expires_at>?",
        args: [id, new Date().toISOString()],
      })).rows[0];
      return row ? JSON.parse(String(row.value_json)) : undefined;
    },
  };
}
