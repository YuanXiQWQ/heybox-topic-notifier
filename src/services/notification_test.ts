/** @file 独立尝试统一测试中的各个已开启通道，并保留失败详情。 */

/**
 * 同时测试所选通道，等待所有通道结束后报告首个失败，不因一路失败而跳过其它通道。
 * @param {Array<() => Promise<unknown>>} channels 已开启的通知通道。
 * @return {Promise<void>} 全部通道已受理；失败时保留原错误类型及状态码。
 */
export async function sendNotificationTest(channels: Array<() => Promise<unknown>>): Promise<void> {
  const results = await Promise.allSettled(channels.map((send) => Promise.resolve().then(send)));
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
