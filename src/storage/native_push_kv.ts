/** @file 使用 Deno KV 保存与账号及会话绑定的原生应用推送设备。 */
import type { KvStore } from "./kv.ts";
import type { NativePushDevice, NativePushStore } from "./native_push_types.ts";

/**
 * 创建原生应用推送设备存储，使用推送设备哈希去重并原子维护用户索引。
 * @param {() => Promise<KvStore>} open KV 获取函数。
 * @return {NativePushStore} 推送设备存储。
 */
export function createKvNativePushStore(
  open: () => Promise<KvStore>,
): NativePushStore {
  return {
    /**
     * 读取当前用户仍然拥有的设备，忽略已换绑的索引。
     * @param {string} userId 用户 ID。
     * @return {Promise<NativePushDevice[]>} 用户推送设备。
     */
    async list(userId) {
      const db = await open();
      const devices: NativePushDevice[] = [];
      for await (
        const entry of db.list<string>({ prefix: ["nativePushUsers", userId] })
      ) {
        const device = await db.get<NativePushDevice>([
          "nativePushDevices",
          entry.value,
        ]);
        if (device.value?.userId === userId) devices.push(device.value);
      }
      return devices;
    },
    /**
     * 原子换绑设备和用户索引，防止原生应用同时接收其它账号通知。
     * @param {NativePushDevice} device 推送设备。
     */
    async save(device) {
      const db = await open();
      const key = ["nativePushDevices", device.id];
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await db.get<NativePushDevice>(key);
        const tx = db.atomic().check({
          key,
          versionstamp: current.versionstamp,
        });
        if (current.value) {
          tx.delete(["nativePushUsers", current.value.userId, device.id]);
        }
        const result = await tx.set(key, device)
          .set(["nativePushUsers", device.userId, device.id], device.id)
          .commit();
        if (result.ok) return;
      }
      throw new Error("Push subscription write conflict");
    },
    /**
     * 对仍属于该账号的设备执行原子删除。
     * @param {string} id 设备 ID。
     * @param {string} userId 用户 ID。
     * @param {string | undefined} sessionHash 清理时要求仍属于被检查的会话。
     */
    async remove(id, userId, sessionHash) {
      const db = await open();
      const key = ["nativePushDevices", id];
      for (let attempt = 0; attempt < 8; attempt++) {
        const current = await db.get<NativePushDevice>(key);
        if (current.value?.userId !== userId) return;
        if (sessionHash && current.value.sessionHash !== sessionHash) return;
        const result = await db.atomic().check({
          key,
          versionstamp: current.versionstamp,
        })
          .delete(key).delete(["nativePushUsers", userId, id]).commit();
        if (result.ok) return;
      }
      throw new Error("Push subscription delete conflict");
    },
  };
}
