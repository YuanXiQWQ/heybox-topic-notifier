/** @file 定义可断线补取的账号通知收件箱，客户端按事件 ID 去重。 */

/** 一条不包含凭据的系统通知事件。 */
export type NativeNotification = {
  id: string;
  cursor: string;
  createdAt: number;
  title: string;
  body: string;
  path: string;
};
/** 原生通知持久接口，收件箱与其它通知通道互不依赖。 */
export type NativeNotificationStore = {
  /**
   * 幂等保存事件，同一 ID 的重试不产生另一条通知。
   * @param {NativeNotification} event 通知事件。
   * @return {Promise<NativeNotification>} 包含权威顺序游标的事件。
   */
  save(event: NativeNotification): Promise<NativeNotification>;
  /**
   * 顺序获取游标之后的事件，首次连接仅获取当前末尾游标。
   * @param {string | undefined} after 已消费游标；省略表示初始化。
   * @return {Promise<{events: NativeNotification[], cursor: string}>} 通知批次。
   */
  read(
    after?: string,
  ): Promise<{ events: NativeNotification[]; cursor: string }>;
};
/** 通知收件箱保留三十天，以便断网后补取。 */
export const nativeNotificationRetentionMs = 30 * 24 * 60 * 60 * 1000;
