/** @file 定义按通道持久化、租约领取并独立重试的命中通知任务。 */
import type { MatchRecord } from "../models.ts";

/** 分别确认投递的通道；已成功通道不随其它通道重试。 */
export type NotificationChannel = "other" | "browser" | "native";
/** 由持有租约的发送者处理的持久化任务。 */
export type NotificationJob = {
  id: string;
  channel: NotificationChannel;
  token: string;
  attempts: number;
  record: MatchRecord;
};
/** 新命中记录的原子投递选项，普通详情刷新不创建任务。 */
export type MatchSaveOptions = { notify?: boolean };
/** 账号隔离的通知持久化接口。 */
export type NotificationOutbox = {
  /**
   * @param {number} now 当前毫秒时间。
   * @return {Promise<NotificationJob[]>} 已领取并带租约的到期任务。
   */
  claim(now: number): Promise<NotificationJob[]>;
  /**
   * @param {NotificationJob[]} jobs 持有的任务。
   * @param {string | undefined} acceptedAt 通道受理时间，省略表示渠道关闭或没有接收设备。
   */
  complete(jobs: NotificationJob[], acceptedAt?: string): Promise<void>;
  /**
   * @param {NotificationJob[]} jobs 待重试的任务。
   * @param {number} now 失败时间，按尝试次数设置下一次重试。
   */
  retry(jobs: NotificationJob[], now: number): Promise<void>;
};
