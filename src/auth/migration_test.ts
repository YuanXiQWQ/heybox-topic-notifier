/**
 * @file 本文件验证认证迁移检查辅助能力。
 */
import type { PasswordCredential, UserAccount } from "../models.ts";
import { assertEquals } from "../test_helpers.ts";
import { listLegacyOnlyPasswordAccounts } from "./migration.ts";

Deno.test("listLegacyOnlyPasswordAccounts returns only legacy accounts without credentials", async () => {
  const accounts: UserAccount[] = [
    legacyAccount("legacy-id", "legacy"),
    legacyAccount("migrated-id", "migrated"),
    {
      createdAt: "2026-07-31T00:00:00.000Z",
      id: "passwordless-id",
      username: "passwordless",
    },
  ];
  const credentials = new Map<string, PasswordCredential>([
    ["migrated-id", passwordCredential("migrated-id")],
  ]);

  const legacyOnlyAccounts = await listLegacyOnlyPasswordAccounts({
    getPasswordCredential: (userId: string) =>
      Promise.resolve(credentials.get(userId)),
    listAccounts: () => Promise.resolve(accounts),
  });

  assertEquals(legacyOnlyAccounts, [{
    createdAt: "2026-07-31T00:00:00.000Z",
    userId: "legacy-id",
    username: "legacy",
  }]);
});

/**
 * 创建带旧密码字段的测试账号。
 *
 * @param id 账号 ID。
 * @param username 用户名。
 * @return 测试账号。
 */
function legacyAccount(id: string, username: string): UserAccount {
  return {
    createdAt: "2026-07-31T00:00:00.000Z",
    id,
    passwordHash: "password-hash",
    passwordIterations: 210_000,
    passwordSalt: "password-salt",
    username,
  };
}

/**
 * 创建测试密码凭证。
 *
 * @param userId 用户 ID。
 * @return 测试密码凭证。
 */
function passwordCredential(userId: string): PasswordCredential {
  return {
    passwordHash: "password-hash",
    passwordIterations: 210_000,
    passwordSalt: "password-salt",
    updatedAt: "2026-07-31T00:00:00.000Z",
    userId,
  };
}
