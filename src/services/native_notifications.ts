/** @file 将新命中和服务故障转换为可补取的系统通知事件。 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import { getMessages } from "../locales/index.ts";
import { sessionTokenHash } from "../auth/session.ts";
import { notifyHonorDevices } from "./honor_push.ts";
import { aiFallbackNotice, type ServiceNotification } from "./service_notification.ts";

/**
 * 先持久保存整批事件，再发送一次厂商唤醒，客户端可从原游标继续消费。
 * @param {Storage} storage 应用存储。
 * @param {string} userId 账号 ID。
 * @param {MatchRecord[] | ServiceNotification} records 新命中或独立服务通知。
 * @param {AppSettings} settings 本地化设置。
 * @return {Promise<boolean>} 是否已受理事件。
 */
export async function enqueueNativeNotifications(
  storage: Storage,
  userId: string,
  records: MatchRecord[] | ServiceNotification,
  settings: AppSettings,
): Promise<boolean> {
  const inbox = storage.forUser(userId).nativeNotifications;
  if (!inbox || (Array.isArray(records) && !records.length)) return false;
  const createdAt = Date.now();
  const notifications = Array.isArray(records) ? records.map((record) => ({
    id: record.id,
    kind: "match" as const,
    matchId: record.id,
    postId: record.post.id,
    title: getMessages(settings.locale).appName,
    body: [aiFallbackNotice([record], settings), record.post.title.slice(0, 240)].filter(Boolean).join("\n"),
    path: "/history",
  })) : [{ ...records, kind: "service" as const }];
  let latest;
  for (const notification of notifications) {
    const id = await sessionTokenHash(notification.id);
    latest = await inbox.save({
      ...notification,
      id,
      cursor: "",
      createdAt,
    });
  }
  if (latest) await notifyHonorDevices(storage, userId, latest);
  return true;
}
