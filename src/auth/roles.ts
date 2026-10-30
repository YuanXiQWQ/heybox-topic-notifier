/** @file 账号角色规范化与邀请码摘要；权限不接受客户端声明。 */
import type { UserAccount } from "../models.ts";

/** @param {Pick<UserAccount, "role"> | undefined} account 数据库账号。 @return {NonNullable<UserAccount["role"]>} 有效角色。 */
export function accountRole(
  account?: Pick<UserAccount, "role">,
): NonNullable<UserAccount["role"]> {
  return account?.role === "superadmin" || account?.role === "admin"
    ? account.role
    : "user";
}
/** @param {Pick<UserAccount, "role"> | undefined} account 数据库账号。 @return {boolean} 是否可管理邀请码。 */
export function isAdministrator(account?: Pick<UserAccount, "role">): boolean {
  return accountRole(account) !== "user";
}
/** @param {string} value 随机邀请码或短期令牌。 @return {Promise<string>} SHA-256 十六进制摘要。 */
export async function secretDigest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** @return {string} 128 位随机、可复制的邀请码。 */
export function newInvitationCode(): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("").toUpperCase().match(/.{8}/g)!.join("-");
}
/** @param {string} value 用户输入。 @return {string} 不包含格式分隔符的规范邀请码。 */
export function normalizeInvitation(value: string): string {
  return value.trim().replaceAll(/[-\s]/g, "").toUpperCase();
}
