/** @file 独立消费持久化通知通道任务，保留失败任务供重试和重启恢复。 */
import type { MatchRecord } from "../models.ts";
import type { NotificationChannel, NotificationOutbox } from "../storage/notification_outbox.ts";

/** 各通道的单批发送器，返回是否受理；关闭或没有接收设备返回 false。 */
export type NotificationChannels = Record<NotificationChannel, (records: MatchRecord[]) => Promise<boolean>>;

/**
 * 一次领取并独立处理各通道；成功通道立即确认，失败通道按退避时间重试。
 * 外部受理和本地确认之间中断仍可能重复，浏览器标签及原生事件沿用稳定记录 ID。
 * @param {NotificationOutbox} outbox 账号任务存储。
 * @param {NotificationChannels} channels 各通道发送器。
 * @param {() => number} now 时钟。
 * @return {Promise<{sent: boolean, failed: boolean}>} 本批受理与失败状态。
 */
export async function deliverNotificationOutbox(outbox: NotificationOutbox, channels: NotificationChannels, now: () => number = Date.now) {
  const jobs = await outbox.claim(now());
  const results = await Promise.all((["other", "browser", "native"] as const).map(async (channel) => {
    const group = jobs.filter((job) => job.channel === channel);
    if (!group.length) return { sent: false, failed: false };
    try {
      const sent = await channels[channel](group.map((job) => job.record));
      await outbox.complete(group, sent ? new Date(now()).toISOString() : undefined);
      return { sent, failed: false };
    } catch {
      await outbox.retry(group, now());
      console.warn(`Notification outbox channel ${channel} will retry.`);
      return { sent: false, failed: true };
    }
  }));
  return { sent: results.some((result) => result.sent), failed: results.some((result) => result.failed) };
}
