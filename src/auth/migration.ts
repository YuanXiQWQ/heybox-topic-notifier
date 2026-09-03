/**
 * @file 本文件提供认证数据迁移检查辅助能力。
 */
import type { PasswordCredential, UserAccount } from "../models.ts";
import type { Storage } from "../storage/types.ts";

/**
 * 认证迁移检查需要使用的存储能力。
 */
type MigrationStorage = Pick<
  Storage,
  "getPasswordCredential" | "listAccounts"
>;

/**
 * 仍仅依赖旧密码字段的账号摘要。
 */
export type LegacyOnlyPasswordAccount = {
  createdAt: string;
  userId: string;
  username: string;
};

/**
 * 列出仍只有旧密码字段、尚未保存独立密码凭证的账号。
 *
 * @param storage 应用存储。
 * @return legacy-only 账号摘要列表。
 */
export async function listLegacyOnlyPasswordAccounts(
  storage: MigrationStorage,
): Promise<LegacyOnlyPasswordAccount[]> {
  const accounts = await storage.listAccounts();
  const legacyOnlyAccounts: LegacyOnlyPasswordAccount[] = [];

  for (const account of accounts) {
    if (!hasLegacyPasswordFields(account)) {
      continue;
    }

    const credential = await storage.getPasswordCredential(account.id);
    if (credential) {
      continue;
    }

    legacyOnlyAccounts.push({
      createdAt: account.createdAt,
      userId: account.id,
      username: account.username,
    });
  }

  return legacyOnlyAccounts;
}

/**
 * 判断账号是否仍携带旧版密码字段。
 *
 * @param account 用户账号。
 * @return 旧版密码字段完整时返回 true。
 */
function hasLegacyPasswordFields(
  account: UserAccount,
): account is
  & UserAccount
  & Pick<
    PasswordCredential,
    "passwordHash" | "passwordIterations" | "passwordSalt"
  > {
  return Boolean(
    account.passwordHash && account.passwordSalt && account.passwordIterations,
  );
}
