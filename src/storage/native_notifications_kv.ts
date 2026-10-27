/** @file 使用 KV 保存可补取的通知事件并按账号隔离。 */
import type { KvStore } from "./kv.ts";
import {
  type NativeNotification,
  nativeNotificationRetentionMs,
  type NativeNotificationStore,
} from "./native_notifications.ts";

/**
 * 创建账号通知收件箱，事件写入和去重标记保持原子性。
 * @param {() => Promise<KvStore>} open KV 获取器。
 * @param {string} userId 账号 ID。
 * @return {NativeNotificationStore} 通知接口。
 */
export function createKvNativeNotifications(
  open: () => Promise<KvStore>,
  userId: string,
): NativeNotificationStore {
  return {
    /**
     * 保存事件并设置保留时间，重复投递不会移动游标。
     * @param {NativeNotification} event 事件。
     * @return {Promise<NativeNotification>} 带数据库顺序游标的事件。
     */
    async save(event) {
      const db = await open();
      const key = ["nativeNotificationIds", userId, event.id];
      const sequenceKey = ["nativeNotificationSequence", userId];
      for (let attempt = 0; attempt < 16; attempt++) {
        const existing = await db.get<NativeNotification>(key);
        if (existing.value) return existing.value;
        const sequence = await db.get<number>(sequenceKey);
        const number = event.cursor
          ? Number(event.cursor.split(":")[0])
          : (sequence.value ?? 0) + 1;
        const saved = {
          ...event,
          cursor: `${String(number).padStart(16, "0")}:${event.id}`,
        };
        const result = await db.atomic().check({ key, versionstamp: null })
          .check({ key: sequenceKey, versionstamp: sequence.versionstamp })
          .set(sequenceKey, Math.max(number, sequence.value ?? 0)).set(
            key,
            saved,
            { expireIn: nativeNotificationRetentionMs },
          )
          .set(["nativeNotifications", userId, saved.cursor], saved, {
            expireIn: nativeNotificationRetentionMs,
          }).commit();
        if (result.ok) return saved;
      }
      throw new Error("Notification write conflict");
    },
    /**
     * 返回最多一百条事件；消费方保存最后一条的游标后继续读取。
     * @param {string | undefined} after 已消费游标。
     * @return {Promise<{events: NativeNotification[], cursor: string}>} 批次。
     */
    async read(after) {
      const db = await open();
      const events: NativeNotification[] = [];
      let cursor = after ?? "";
      for await (
        const item of db.list<NativeNotification>({
          prefix: ["nativeNotifications", userId],
        })
      ) {
        if (item.value.createdAt < Date.now() - nativeNotificationRetentionMs) {
          continue;
        }
        if (after === undefined) {
          if (item.value.cursor > cursor) cursor = item.value.cursor;
          continue;
        }
        if (item.value.cursor > after) {
          events.push(item.value);
          cursor = item.value.cursor;
        }
        if (events.length === 100) break;
      }
      return { events, cursor };
    },
  };
}
