/** @file 汇总彼此独立的应用通知和其它通知投递结果。 */
import type { AppSettings } from "../models.ts";
import type { NotifyResult } from "./notifier.ts";

/**
 * 等待两个通道各自执行，只要一个受理就记录通知成功；失败通道单独记录。
 * @param {AppSettings["notificationProvider"]} provider 其它通知渠道。
 * @param {() => Promise<NotifyResult>} other 邮件或 Webhook 发送器。
 * @param {() => Promise<boolean>} application 应用通知发送器。
 * @param {(channel: string) => void} onFailure 不含敏感载荷的错误记录器。
 * @return {Promise<NotifyResult>} 聚合受理状态；其它通知独立失败且无应用受理时抛出其错误。
 */
export async function sendIndependentNotifications(
  provider: AppSettings["notificationProvider"],
  other: () => Promise<NotifyResult>,
  application: () => Promise<boolean>,
  onFailure: (channel: string) => void = (channel) =>
    console.warn(`${channel}通知投递失败。`),
): Promise<NotifyResult> {
  const [otherResult, appResult] = await Promise.allSettled([
    Promise.resolve().then(other),
    Promise.resolve().then(application),
  ]);
  if (appResult.status === "rejected") onFailure("应用");
  if (otherResult.status === "rejected") {
    onFailure("其它");
    if (appResult.status === "fulfilled" && appResult.value) {
      return { provider, sent: true };
    }
    throw otherResult.reason;
  }
  return {
    ...otherResult.value,
    sent: otherResult.value.sent ||
      (appResult.status === "fulfilled" && appResult.value),
  };
}
