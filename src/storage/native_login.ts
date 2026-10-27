/** @file 定义系统浏览器与原生应用之间一次性的 PKCE 登录交接。 */
/** 登录交接保留五分钟；已消费记录保留到过期以拒绝重放。 */
export type NativeLogin = {
  id: string;
  challenge: string;
  expiresAt: number;
  userId?: string;
  consumed?: boolean;
};
/** 原子交接接口，账号只能由已登录的网页授权。 */
export type NativeLoginStore = {
  /** @param {NativeLogin} value 待授权交接。 @return {Promise<boolean>} 是否创建成功。 */
  create(value: NativeLogin): Promise<boolean>;
  /** @param {string} id 交接 ID。 @return {Promise<NativeLogin | undefined>} 未过期状态。 */
  read(id: string): Promise<NativeLogin | undefined>;
  /** @param {string} id 交接 ID。 @param {string} userId 授权账号。 @return {Promise<boolean>} 是否授权成功。 */
  approve(id: string, userId: string): Promise<boolean>;
  /** @param {string} id 交接 ID。 @param {string} challenge PKCE 摘要。 @return {Promise<string | undefined>} 单次取得的账号。 */
  consume(id: string, challenge: string): Promise<string | undefined>;
};
