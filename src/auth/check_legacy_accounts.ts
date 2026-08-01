/**
 * @file 本文件提供旧账号密码凭证迁移检查命令。
 */
import { createAppContext } from "../services/app_context.ts";
import { listLegacyOnlyPasswordAccounts } from "./migration.ts";

if (import.meta.main) {
  const context = createAppContext();
  const accounts = await listLegacyOnlyPasswordAccounts(context.storage);

  console.log(JSON.stringify(
    {
      accounts,
      legacyOnlyCount: accounts.length,
    },
    null,
    2,
  ));
}
