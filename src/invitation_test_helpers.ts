/** @file 既有认证回归测试使用的显式邀请码夹具；并发与核销契约由真实存储测试覆盖。 */
import type { Storage } from "./storage/types.ts";
import type { AdminTemporary } from "./storage/administration_types.ts";
import { normalizeInvitation, secretDigest } from "./auth/roles.ts";

/** @param {Storage} storage 测试存储。 */
export function installTestInvitations(storage: Storage): void {
  const temporary = new Map<string, AdminTemporary>();
  storage.administration = {
    /** 测试夹具不执行跨库复制。 */
    applySnapshot: () => Promise.resolve(),
    /** @return {Promise<never[]>} 空列表。 */
    listInvitations: () => Promise.resolve([]),
    /** @return {Promise<"forbidden">} 禁止测试夹具管理。 */
    issue: () => Promise.resolve("forbidden"),
    /** @return {Promise<"forbidden">} 禁止测试夹具管理。 */
    revoke: () => Promise.resolve("forbidden"),
    /** @return {Promise<"forbidden">} 禁止测试夹具管理。 */
    createUser: () => Promise.resolve("forbidden"),
    /** @return {Promise<"forbidden">} 禁止测试夹具管理。 */
    editUser: () => Promise.resolve("forbidden"),
    /** @return {Promise<"forbidden">} 禁止测试夹具管理。 */
    deleteUser: () => Promise.resolve("forbidden"),
    /** @param {AdminTemporary} value 短期测试资料。 */
    putTemporary(value) {
      temporary.set(value.id, value);
      return Promise.resolve();
    },
    /** @param {string} id 测试标识。 @return {Promise<AdminTemporary|undefined>} 资料。 */
    getTemporary(id) {
      return Promise.resolve(temporary.get(id));
    },
    /** @param {import("./storage/administration_types.ts").AccountCreation} input 测试账号。 @param {string} hash 邀请摘要。 @param {string} pending 短期标识。 @return {Promise<import("./storage/administration_types.ts").AdminResult>} 创建结果。 */
    async register(input, hash, pending) {
      if (hash !== await secretDigest(normalizeInvitation("test-invitation"))) {
        return "invitation";
      }
      if (!await storage.createAccount(input.account)) return "conflict";
      if (input.password) await storage.savePasswordCredential(input.password);
      if (input.email) await storage.saveEmailCredential(input.email);
      if (input.identity) await storage.saveAuthIdentity(input.identity);
      if (pending) temporary.delete(pending);
      return "ok";
    },
  };
}
