/** @file 定义浏览器推送订阅及其用户隔离存储契约。 */

/** 浏览器提供的加密推送订阅。 */
export type BrowserPushSubscription = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
};
/** 与登录会话绑定的浏览器通知设备；退出登录后不再发送。 */
export type WebPushDevice = {
  id: string;
  userId: string;
  sessionHash: string;
  subscription: BrowserPushSubscription;
  updatedAt: string;
};
/** 浏览器通知设备持久化操作。 */
export type WebPushStore = {
  /**
   * 列出指定用户的浏览器推送设备。
   * @param {string} userId 用户 ID。
   * @return {Promise<WebPushDevice[]>} 用户设备。
   */
  list(userId: string): Promise<WebPushDevice[]>;
  /**
   * 将订阅绑定到当前账号与登录会话，同一浏览器只保留一个账号。
   * @param {WebPushDevice} device 已验证的订阅设备。
   */
  save(device: WebPushDevice): Promise<void>;
  /**
   * 仅删除指定账号拥有的订阅。
   * @param {string} id 订阅 ID。
   * @param {string} userId 用户 ID。
   * @param {string | undefined} sessionHash 清理时要求仍属于被检查的会话。
   */
  remove(id: string, userId: string, sessionHash?: string): Promise<void>;
};
