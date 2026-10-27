/** @file 用 KV 比较交换保护登录交接的授权和单次消费。 */
import type { KvStore } from "./kv.ts";
import type { NativeLogin, NativeLoginStore } from "./native_login.ts";

/**
 * 创建全局原生登录交接存储。
 * @param {() => Promise<KvStore>} open KV 获取器。
 * @return {NativeLoginStore} 一次性交接接口。
 */
export function createKvNativeLogin(
  open: () => Promise<KvStore>,
): NativeLoginStore {
  return {
    /** @param {NativeLogin} value 新交接。 @return {Promise<boolean>} 是否成功。 */
    async create(value) {
      const db = await open();
      const key = ["nativeLogin", value.id];
      return (await db.atomic().check({ key, versionstamp: null }).set(
        key,
        value,
        { expireIn: Math.max(1, value.expiresAt - Date.now()) },
      ).commit()).ok;
    },
    /** @param {string} id 交接 ID。 @return {Promise<NativeLogin | undefined>} 当前未过期状态。 */
    async read(id) {
      const value =
        (await (await open()).get<NativeLogin>(["nativeLogin", id])).value;
      return value && value.expiresAt > Date.now() ? value : undefined;
    },
    /** @param {string} id 交接 ID。 @param {string} userId 授权账号。 @return {Promise<boolean>} 授权结果。 */
    async approve(id, userId) {
      const db = await open(),
        key = ["nativeLogin", id],
        current = await db.get<NativeLogin>(key);
      if (
        !current.value || current.value.consumed || current.value.userId ||
        current.value.expiresAt <= Date.now()
      ) return false;
      return (await db.atomic().check({
        key,
        versionstamp: current.versionstamp,
      }).set(key, { ...current.value, userId }, {
        expireIn: current.value.expiresAt - Date.now(),
      }).commit()).ok;
    },
    /** @param {string} id 交接 ID。 @param {string} challenge PKCE 摘要。 @return {Promise<string | undefined>} 单次取得的账号。 */
    async consume(id, challenge) {
      const db = await open(),
        key = ["nativeLogin", id],
        current = await db.get<NativeLogin>(key);
      if (
        !current.value?.userId || current.value.consumed ||
        current.value.challenge !== challenge ||
        current.value.expiresAt <= Date.now()
      ) return;
      return (await db.atomic().check({
          key,
          versionstamp: current.versionstamp,
        }).set(key, { ...current.value, consumed: true }, {
          expireIn: current.value.expiresAt - Date.now(),
        }).commit()).ok
        ? current.value.userId
        : undefined;
    },
  };
}
