/** @file 处理账号密码的派生、验证及旧凭证迁移。 */
import type { PasswordCredential, UserAccount } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEquals,
} from "../security/crypto_utils.ts";

/** 验证密码所需的派生值和派生参数。 */
type PasswordHashFields = Pick<
  PasswordCredential,
  "passwordHash" | "passwordIterations" | "passwordSalt"
>;

/**
 * 密码 PBKDF2 迭代次数。
 */
const passwordIterations = 210_000;
/**
 * 对密码进行加盐哈希。
 *
 * @param {string} password 原始密码。
 * @return {Promise<PasswordHashFields>} 密码哈希、盐和迭代次数。
 */
export async function hashPassword(
  password: string,
): Promise<
  PasswordHashFields
> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordIterations);

  return {
    passwordHash: base64UrlEncode(hash),
    passwordIterations,
    passwordSalt: base64UrlEncode(salt),
  };
}

/**
 * 校验账号密码，必要时将旧账号密码字段迁移到独立凭证。
 *
 * @param {string} password 原始密码。
 * @param {UserAccount} account 用户账号。
 * @param {Storage} storage 应用存储。
 * @return {Promise<boolean>} 密码匹配时返回 true。
 */
export async function verifyAccountPassword(
  password: string,
  account: UserAccount,
  storage: Storage,
): Promise<boolean> {
  if (await verifyPassword(password, account)) {
    await ensureAccountPasswordCredential(account, storage);
    return true;
  }

  if (hasLegacyPasswordFields(account)) {
    return false;
  }

  const credential = await storage.getPasswordCredential(account.id);
  return credential ? await verifyPassword(password, credential) : false;
}

/**
 * 将账号上的密码字段保存为独立密码凭证。
 *
 * @param {UserAccount} account 用户账号。
 * @param {Storage} storage 应用存储。
 */
export async function saveAccountPasswordCredential(
  account: UserAccount,
  storage: Storage,
): Promise<void> {
  const credential = passwordCredentialFromAccount(account);
  if (!credential) {
    return;
  }

  await storage.savePasswordCredential(credential);
}

/**
 * 校验密码是否匹配账号密码哈希。
 *
 * @param {string} password 原始密码。
 * @param {Partial<PasswordHashFields>} credential 密码哈希字段。
 * @return {Promise<boolean>} 密码字段存在且匹配时返回 true。
 */
async function verifyPassword(
  password: string,
  credential: Partial<
    PasswordHashFields
  >,
): Promise<boolean> {
  if (
    !credential.passwordHash ||
    !credential.passwordSalt ||
    !credential.passwordIterations
  ) {
    return false;
  }

  const hash = await derivePasswordHash(
    password,
    base64UrlDecode(credential.passwordSalt),
    credential.passwordIterations,
  );
  return constantTimeEquals(base64UrlEncode(hash), credential.passwordHash);
}

/**
 * 判断账号是否仍携带旧版密码字段。
 *
 * @param {UserAccount} account 用户账号。
 * @return {boolean} 旧版密码字段完整时返回 true。
 */
function hasLegacyPasswordFields(
  account: UserAccount,
): account is
  & UserAccount
  & PasswordHashFields {
  return Boolean(
    account.passwordHash && account.passwordSalt && account.passwordIterations,
  );
}

/**
 * 从账号旧版密码字段创建独立密码凭证。
 *
 * @param {UserAccount} account 用户账号。
 * @return {PasswordCredential | undefined} 密码字段完整时返回独立密码凭证。
 */
export function passwordCredentialFromAccount(
  account: UserAccount,
): PasswordCredential | undefined {
  if (!hasLegacyPasswordFields(account)) {
    return undefined;
  }

  return {
    passwordHash: account.passwordHash,
    passwordIterations: account.passwordIterations,
    passwordSalt: account.passwordSalt,
    updatedAt: new Date().toISOString(),
    userId: account.id,
  };
}

/**
 * 确保旧账号密码字段已经迁移为独立密码凭证。
 *
 * @param {UserAccount} account 用户账号。
 * @param {Storage} storage 应用存储。
 */
async function ensureAccountPasswordCredential(
  account: UserAccount,
  storage: Storage,
): Promise<void> {
  const credential = passwordCredentialFromAccount(account);
  if (!credential) {
    return;
  }

  const existing = await storage.getPasswordCredential(account.id);
  if (samePasswordCredential(existing, credential)) {
    return;
  }

  await storage.savePasswordCredential(credential);
}

/**
 * 判断两个密码凭证的哈希字段是否一致。
 *
 * @param {PasswordCredential | undefined} left 已保存的密码凭证。
 * @param {PasswordCredential} right 待保存的密码凭证。
 * @return {boolean} 哈希字段一致时返回 true。
 */
function samePasswordCredential(
  left: PasswordCredential | undefined,
  right: PasswordCredential,
): boolean {
  return left?.passwordHash === right.passwordHash &&
    left.passwordIterations === right.passwordIterations &&
    left.passwordSalt === right.passwordSalt;
}

/**
 * 使用 PBKDF2 派生密码哈希。
 *
 * @param {string} password 原始密码。
 * @param {Uint8Array<ArrayBuffer>} salt 密码盐。
 * @param {number} iterations 迭代次数。
 * @return {Promise<Uint8Array>} 派生出的密码哈希字节。
 */
async function derivePasswordHash(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}
