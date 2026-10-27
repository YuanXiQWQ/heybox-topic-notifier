/** @file 将新命中转换为可补取的系统通知事件。 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import { getMessages } from "../locales/index.ts";
import { sessionTokenHash } from "../auth/session.ts";
import { notifyHonorDevices } from "./honor_push.ts";

/**
 * 持久保存通知事件，客户端在线或从休眠恢复后可继续消费。
 * @param {Storage} storage 应用存储。
 * @param {string} userId 账号 ID。
 * @param {MatchRecord[]} records 新命中。
 * @param {AppSettings} settings 本地化设置。
 * @return {Promise<boolean>} 是否已受理事件。
 */
export async function enqueueNativeNotifications(
  storage: Storage,
  userId: string,
  records: MatchRecord[],
  settings: AppSettings,
): Promise<boolean> {
  const inbox = storage.forUser(userId).nativeNotifications;
  if (!inbox || !records.length) return false;
  const createdAt = Date.now();
  for (const record of records) {
    const id = await sessionTokenHash(record.id);
    const event = await inbox.save({
      id,
      cursor: "",
      createdAt,
      title: getMessages(settings.locale).appName,
      body: record.post.title.slice(0, 240),
      path: "/history",
    });
    await notifyHonorDevices(storage, userId, event);
  }
  return true;
}
