/** @file Deno KV 中账号管理与单次邀请码的原子操作。 */
import type { KvStore } from "./kv.ts";
import type { UserAccount } from "../models.ts";
import { accountRole, isAdministrator } from "../auth/roles.ts";
import type {
  AccountCreation,
  AdministrationStore,
  AdminTemporary,
  Invitation,
} from "./administration_types.ts";

/** @param {() => Promise<KvStore>} open KV 连接。 @return {AdministrationStore} 管理存储。 */
export function createKvAdministration(
  open: () => Promise<KvStore>,
): AdministrationStore {
  /** @param {string} id 操作者。 @param {boolean} superOnly 是否只允许超级管理员。 @return {Promise<object>} 带版本的授权记录。 */
  async function actorEntry(id: string, superOnly = false) {
    const db = await open(), key = ["accounts", id];
    const entry = await db.get<UserAccount>(key);
    return {
      db,
      key,
      entry,
      allowed: !!entry.value &&
        (superOnly
          ? accountRole(entry.value) === "superadmin"
          : isAdministrator(entry.value)),
    };
  }
  /** @param {AccountCreation} input 账号和凭据。 @param {string} actor 管理员或空字符串。 @param {string} invitation 邀请摘要。 @param {string} pending 注册事务标识。 @return {Promise<import("./administration_types.ts").AdminResult>} 创建结果。 */
  async function create(
    input: AccountCreation,
    actor: string,
    invitation?: string,
    pending?: string,
  ): Promise<import("./administration_types.ts").AdminResult> {
    const db = await open(),
      account = {
        ...input.account,
        role: actor ? accountRole(input.account) : "user" as const,
        roleVersion: 0,
      };
    let tx = db.atomic().check({
      key: ["accounts", account.id],
      versionstamp: null,
    }).check({ key: ["deletedAccounts", account.id], versionstamp: null })
      .check({
        key: ["accountUsernames", account.username.toLowerCase()],
        versionstamp: null,
      });
    if (actor) {
      const auth = await actorEntry(actor, true);
      if (!auth.allowed) return "forbidden";
      tx = tx.check({ key: auth.key, versionstamp: auth.entry.versionstamp });
    } else {
      const key = ["invitations", invitation ?? ""],
        entry = await db.get<Invitation>(key),
        value = entry.value;
      if (
        !value || value.usedAt || value.revokedAt ||
        (value.expiresAt && Date.parse(value.expiresAt) <= Date.now())
      ) return "invitation";
      tx = tx.check({ key, versionstamp: entry.versionstamp }).set(key, {
        ...value,
        usedAt: new Date().toISOString(),
        usedBy: account.id,
      });
    }
    if (pending) {
      const key = ["adminTemporary", pending],
        entry = await db.get<AdminTemporary>(key);
      if (
        !entry.value?.creation ||
        entry.value.creation.account.id !== account.id ||
        Date.parse(entry.value.expiresAt) <= Date.now()
      ) return "conflict";
      tx = tx.check({ key, versionstamp: entry.versionstamp }).delete(key);
    }
    tx = tx.set(["accounts", account.id], account).set([
      "accountUsernames",
      account.username.toLowerCase(),
    ], account.id);
    if (input.password) {
      tx = tx.set(["passwordCredentials", account.id], input.password);
    }
    if (input.email) {
      const emailKey = ["registrationEmails", input.email.email.toLowerCase()];
      if (!input.identity) {
        tx = tx.check({ key: emailKey, versionstamp: null }).set(
          emailKey,
          account.id,
        );
      }
      tx = tx.set([
        "emailCredentials",
        account.id,
        input.email.email.toLowerCase(),
      ], input.email);
    }
    if (input.identity) {
      const key = [
        "authIdentities",
        input.identity.provider,
        input.identity.providerUserId,
      ];
      tx = tx.check({ key, versionstamp: null }).set(key, input.identity);
    }
    return (await tx.commit()).ok ? "ok" : "conflict";
  }
  return {
    /** @param {import("./administration_types.ts").AdministrationSnapshot} snapshot 已提交的权威状态。 */
    async applySnapshot(snapshot) {
      const db = await open();
      let tx = db.atomic();
      if (snapshot.deletedId) {
        const id = snapshot.deletedId,
          key = ["accounts", id],
          entry = await db.get<UserAccount>(key);
        tx = tx.check({ key, versionstamp: entry.versionstamp }).delete(key)
          .set(["deletedAccounts", id], new Date().toISOString());
        if (entry.value) {
          tx = tx.delete([
            "accountUsernames",
            entry.value.username.toLowerCase(),
          ]);
        }
      }
      if (snapshot.creation) {
        const input = snapshot.creation,
          account = input.account,
          key = ["accounts", account.id],
          current = await db.get<UserAccount>(key),
          deleted = await db.get(["deletedAccounts", account.id]);
        if (
          !deleted.value &&
          (current.value?.roleVersion ?? 0) <= (account.roleVersion ?? 0)
        ) {
          tx = tx.check({ key, versionstamp: current.versionstamp }).check({
            key: ["deletedAccounts", account.id],
            versionstamp: null,
          }).set(key, account).set([
            "accountUsernames",
            account.username.toLowerCase(),
          ], account.id);
          if (current.value && current.value.username !== account.username) {
            tx = tx.delete([
              "accountUsernames",
              current.value.username.toLowerCase(),
            ]);
          }
          if (input.password) {
            tx = tx.set(["passwordCredentials", account.id], input.password);
          }
          if (input.email) {
            tx = tx.set([
              "emailCredentials",
              account.id,
              input.email.email.toLowerCase(),
            ], input.email);
          }
          if (input.identity) {
            tx = tx.set([
              "authIdentities",
              input.identity.provider,
              input.identity.providerUserId,
            ], input.identity);
          }
        }
      }
      for (const value of snapshot.invitations ?? []) {
        const key = ["invitations", value.id],
          current = await db.get<Invitation>(key);
        if (!current.value?.usedAt && !current.value?.revokedAt) {
          tx = tx.check({ key, versionstamp: current.versionstamp }).set(
            key,
            value,
          );
        }
      }
      if (!(await tx.commit()).ok) {
        throw new Error("Administration mirror conflict");
      }
      if (snapshot.deletedId) await purgeKvAccount(db, snapshot.deletedId);
    },
    /** @return {Promise<Invitation[]>} 邀请列表。 */
    async listInvitations() {
      const rows: Invitation[] = [];
      for await (
        const row of (await open()).list<Invitation>({
          prefix: ["invitations"],
        })
      ) rows.push(row.value);
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    /** @param {string} actor 操作者。 @param {Invitation[]} invitations 邀请码。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    async issue(actor, invitations) {
      const auth = await actorEntry(actor);
      if (!auth.allowed) return "forbidden";
      let tx = auth.db.atomic().check({
        key: auth.key,
        versionstamp: auth.entry.versionstamp,
      });
      for (const value of invitations) {
        tx = tx.check({ key: ["invitations", value.id], versionstamp: null })
          .set(["invitations", value.id], value);
      }
      return (await tx.commit()).ok ? "ok" : "conflict";
    },
    /** @param {string} actor 操作者。 @param {string} id 邀请摘要。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    async revoke(actor, id) {
      const auth = await actorEntry(actor);
      if (!auth.allowed) return "forbidden";
      const key = ["invitations", id], row = await auth.db.get<Invitation>(key);
      if (!row.value || row.value.usedAt || row.value.revokedAt) {
        return "conflict";
      }
      return (await auth.db.atomic().check({
          key: auth.key,
          versionstamp: auth.entry.versionstamp,
        }).check({ key, versionstamp: row.versionstamp }).set(key, {
          ...row.value,
          revokedAt: new Date().toISOString(),
        }).commit()).ok
        ? "ok"
        : "conflict";
    },
    /** @param {AccountCreation} input 账号资料。 @param {string} invitation 邀请摘要。 @param {string} pending 短期注册标识。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    register(input, invitation, pending) {
      return create(input, "", invitation, pending);
    },
    /** @param {string} actor 超级管理员。 @param {AccountCreation} input 账号资料。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    createUser(actor, input) {
      return create(input, actor);
    },
    /** @param {string} actor 超级管理员。 @param {import("./administration_types.ts").AccountEdit} input 可编辑字段。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    async editUser(actor, input) {
      const auth = await actorEntry(actor, true);
      if (
        !auth.allowed || (actor === input.id && input.role !== "superadmin")
      ) return "forbidden";
      const key = ["accounts", input.id],
        entry = await auth.db.get<UserAccount>(key),
        current = entry.value;
      if (!current || (current.roleVersion ?? 0) !== input.roleVersion) {
        return "conflict";
      }
      let tx = auth.db.atomic().check({
        key: auth.key,
        versionstamp: auth.entry.versionstamp,
      }).check({ key, versionstamp: entry.versionstamp });
      if (current.username.toLowerCase() !== input.username.toLowerCase()) {
        tx = tx.check({
          key: ["accountUsernames", input.username.toLowerCase()],
          versionstamp: null,
        }).delete(["accountUsernames", current.username.toLowerCase()]).set([
          "accountUsernames",
          input.username.toLowerCase(),
        ], input.id);
      }
      return (await tx.set(key, {
          ...current,
          username: input.username,
          displayName: input.displayName,
          displayNameFromGoogle: false,
          role: accountRole(input),
          roleVersion: (current.roleVersion ?? 0) + 1,
        }).commit()).ok
        ? "ok"
        : "conflict";
    },
    /** @param {string} actor 超级管理员。 @param {string} id 目标账号。 @param {number} version 表单版本。 @return {Promise<import("./administration_types.ts").AdminResult>} 结果。 */
    async deleteUser(actor, id, version) {
      const auth = await actorEntry(actor, true);
      if (!auth.allowed || actor === id) return "forbidden";
      const key = ["accounts", id], entry = await auth.db.get<UserAccount>(key);
      if (!entry.value || (entry.value.roleVersion ?? 0) !== version) {
        return "conflict";
      }
      const result = await auth.db.atomic().check({
        key: auth.key,
        versionstamp: auth.entry.versionstamp,
      }).check({ key, versionstamp: entry.versionstamp })
        .delete(key).delete([
          "accountUsernames",
          entry.value.username.toLowerCase(),
        ]).set(["deletedAccounts", id], new Date().toISOString()).commit();
      if (!result.ok) return "conflict";
      await purgeKvAccount(auth.db, id);
      return "ok";
    },
    /** @param {AdminTemporary} value 短期身份或授权。 */
    async putTemporary(value) {
      await (await open()).set(["adminTemporary", value.id], value, {
        expireIn: Math.max(1, Date.parse(value.expiresAt) - Date.now()),
      });
    },
    /** @param {string} id 令牌摘要。 @return {Promise<AdminTemporary | undefined>} 有效记录。 */
    async getTemporary(id) {
      const row =
        (await (await open()).get<AdminTemporary>(["adminTemporary", id]))
          .value;
      return row && Date.parse(row.expiresAt) > Date.now() ? row : undefined;
    },
  };
}

/** @param {KvStore} db 数据库。 @param {string} id 已删除账号。 @return {Promise<void>} 清理关联数据，保留邀请核销记录。 */
export async function purgeKvAccount(db: KvStore, id: string): Promise<void> {
  const scoped = [
    "userData",
    "userSync",
    "userAvatars",
    "authenticationEvents",
    "emailCredentials",
    "passkeyCredentials",
    "passwordCredentials",
    "securitySettings",
    "totpCredentials",
    "webPushUsers",
    "nativePushUsers",
    "nativeNotifications",
    "nativeNotificationIds",
    "nativeNotificationSequence",
    "matching",
  ];
  const referenced = [
    "sessions",
    "authIdentities",
    "pendingEmailVerifications",
    "pendingMfaChallenges",
    "pendingPasskeyChallenges",
    "pendingRecoveryCodeReveals",
    "webPushDevices",
    "nativePushDevices",
    "nativeLogin",
    "adminTemporary",
    "registrationEmails",
    "passkeyCredentialIndex",
  ];
  for (const group of [...scoped, ...referenced]) {
    const prefix = scoped.includes(group) ? [group, id] : [group];
    if (scoped.includes(group)) {
      const direct = await db.get(prefix);
      if (direct.value !== null) {
        await db.atomic().check({
          key: prefix,
          versionstamp: direct.versionstamp,
        }).delete(prefix).commit();
      }
    }
    for await (const row of db.list<unknown>({ prefix })) {
      if (!row.key) continue;
      const current = await db.get<Record<string, unknown> | string>(row.key);
      const owned = scoped.includes(group) || current.value === id ||
        (typeof current.value === "object" && current.value?.userId === id);
      if (owned) {
        await db.atomic().check({
          key: row.key,
          versionstamp: current.versionstamp,
        }).delete(row.key).commit();
      }
    }
  }
}
