# 认证迁移检查

本文档用于在新认证架构上线后，确认旧密码兼容逻辑是否仍然需要保留。

## 当前数据兼容关系

- 账号主体仍保存在 `accounts/<userId>`，`userId` 不会因为认证方式迁移而变化。
- 用户业务数据仍保存在 `userData/<userId>/...`，包括设置、命中记录和轮询状态。
- 旧版本密码字段位于 `accounts/<userId>` 内的
  `passwordHash`、`passwordSalt`、`passwordIterations`。
- 新版本密码凭证保存在 `passwordCredentials/<userId>`。
- Google、邮箱、Passkey、TOTP 和 2FA 设置分别使用独立 KV key，不会迁移或覆盖
  `userData/<userId>/...`。

因此，只要 `userId` 不变，迁移前已经存在的账号再次登录后仍会读取同一份保存数据。

## 上线后的建议流程

1. 先保留旧密码兼容逻辑发布新版本。
2. 通知用户重新登录一次，或在设置页修改密码、绑定邮箱、绑定 Google、绑定
   Passkey。
3. 运行旧账号扫描命令：

```powershell
deno task auth:check-legacy
```

输出中的 `legacyOnlyCount` 表示仍只有旧账号密码字段、尚未写入
`passwordCredentials/<userId>` 的账号数量。

## 可以删除旧逻辑的条件

只有同时满足以下条件时，才可以删除旧密码兼容读取逻辑：

- `deno task auth:check-legacy` 输出 `legacyOnlyCount: 0`。
- 已完成用户通知，并确认没有用户仍只能依赖旧密码字段登录。
- 生产环境最近一次部署已稳定运行，并通过 `deno task check`。
- 需要保留的账号数据已确认仍按同一 `userId` 读取。

删除旧逻辑前不要删除 `accounts/<userId>` 本身，也不要迁移或重建
`userData/<userId>/...`。

## 删除旧逻辑时需要清理的范围

- `UserAccount` 中旧密码字段的兼容读取。
- `verifyAccountPassword` 中从账号主体读取旧密码字段的回退逻辑。
- 登录成功后惰性写入 `passwordCredentials/<userId>` 的旧字段迁移逻辑。
- 只覆盖 legacy-only 账号兼容路径的测试。

删除后仍应保留
`passwordCredentials/<userId>`、`authIdentities/...`、`emailCredentials/...`、`passkeyCredentials/...`、`totpCredentials/...`
和 `securitySettings/<userId>`。
