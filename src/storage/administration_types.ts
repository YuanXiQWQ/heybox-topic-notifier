/** @file 邀请核销、短期注册身份和管理员账号操作的存储契约。 */
import type {
  AuthIdentity,
  EmailCredential,
  PasswordCredential,
  UserAccount,
} from "../models.ts";

/** 邀请码只保存摘要与管理信息。 */
export type Invitation = {
  id: string;
  createdAt: string;
  createdBy: string;
  note: string;
  expiresAt?: string;
  usedAt?: string;
  usedBy?: string;
  revokedAt?: string;
};
/** 与账号同时写入的登录凭据。 */
export type AccountCreation = {
  account: UserAccount;
  password?: PasswordCredential;
  identity?: AuthIdentity;
  email?: EmailCredential;
};
/** 与浏览器绑定的短期注册资料或管理员再认证授权。 */
export type AdminTemporary = {
  id: string;
  expiresAt: string;
  binding: string;
  creation?: AccountCreation;
  returnTo?: string;
  locale?: string;
  userId?: string;
  roleVersion?: number;
};
/** 原子写入的有限结果，不携带账号隐私。 */
export type AdminResult = "ok" | "forbidden" | "conflict" | "invitation";
/** 用户列表允许编辑的字段；凭据和标识不可通过资料编辑覆盖。 */
export type AccountEdit = Pick<
  UserAccount,
  "id" | "username" | "displayName" | "role" | "roleVersion"
>;
/** 权威存储向迁移副本复制的已提交状态，不重新兑换邀请码。 */
export type AdministrationSnapshot = {
  invitations?: Invitation[];
  creation?: AccountCreation;
  deletedId?: string;
};
/** 管理存储始终在提交时重新校验操作者权限。 */
export type AdministrationStore = {
  /** @param {AdministrationSnapshot} snapshot 服务端内部复制的已提交状态，不暴露路由。 */
  applySnapshot(snapshot: AdministrationSnapshot): Promise<void>;
  /** @return {Promise<Invitation[]>} 邀请记录。 */
  listInvitations(): Promise<Invitation[]>;
  /** @param {string} actor 操作者。 @param {Invitation[]} invitations 邀请记录。 @return {Promise<AdminResult>} 写入结果。 */
  issue(actor: string, invitations: Invitation[]): Promise<AdminResult>;
  /** @param {string} actor 操作者。 @param {string} id 邀请摘要。 @return {Promise<AdminResult>} 撤销结果。 */
  revoke(actor: string, id: string): Promise<AdminResult>;
  /** @param {AccountCreation} input 账号与凭据。 @param {string} invitation 邀请摘要。 @param {string} pending 可选短期注册标识。 @return {Promise<AdminResult>} 核销结果。 */
  register(
    input: AccountCreation,
    invitation: string,
    pending?: string,
  ): Promise<AdminResult>;
  /** @param {string} actor 超级管理员。 @param {AccountCreation} input 账号与凭据。 @return {Promise<AdminResult>} 创建结果。 */
  createUser(actor: string, input: AccountCreation): Promise<AdminResult>;
  /** @param {string} actor 超级管理员。 @param {AccountEdit} input 可编辑资料。 @return {Promise<AdminResult>} 保存结果。 */
  editUser(actor: string, input: AccountEdit): Promise<AdminResult>;
  /** @param {string} actor 超级管理员。 @param {string} id 目标账号。 @param {number} version 表单版本。 @return {Promise<AdminResult>} 删除结果。 */
  deleteUser(actor: string, id: string, version: number): Promise<AdminResult>;
  /** @param {AdminTemporary} value 短期资料。 */
  putTemporary(value: AdminTemporary): Promise<void>;
  /** @param {string} id 随机标识摘要。 @return {Promise<AdminTemporary | undefined>} 未过期资料。 */
  getTemporary(id: string): Promise<AdminTemporary | undefined>;
};
