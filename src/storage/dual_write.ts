/**
 * @file 本文件提供以权威存储响应、向迁移目标镜像写入的双写适配器。
 */
import type { Storage, UserStorage } from "./types.ts";

/**
 * 镜像写入失败信息。
 */
export type StorageMirrorFailure = {
  error: unknown;
  method: string;
};

/**
 * 双写存储选项。
 */
export type DualWriteStorageOptions = {
  onMirrorFailure?: (failure: StorageMirrorFailure) => void;
};

/**
 * 完整存储中的写操作名称。
 */
const storageWriteMethods = new Set<PropertyKey>([
  "clearLoginFailures",
  "completeMatches",
  "consumeAuthenticationEvent",
  "createAccount",
  "deleteAuthIdentity",
  "deleteEmailCredential",
  "deleteMatches",
  "deletePasskeyCredential",
  "deletePendingEmailVerification",
  "deletePendingMfaChallenge",
  "deletePendingPasskeyChallenge",
  "deletePendingRecoveryCodeReveal",
  "deleteSession",
  "deleteTotpCredential",
  "markMatchNotified",
  "recordLoginFailure",
  "recordRateLimitHit",
  "saveAccount",
  "saveAuthenticationEvent",
  "saveAuthIdentity",
  "saveEmailCredential",
  "saveMatch",
  "savePasskeyCredential",
  "savePasswordCredential",
  "savePendingEmailVerification",
  "savePendingMfaChallenge",
  "savePendingPasskeyChallenge",
  "savePendingRecoveryCodeReveal",
  "saveSession",
  "saveSettings",
  "saveTotpCredential",
  "saveUserSecuritySettings",
  "setLastPollAt",
  "updateAccount",
]);

/**
 * 用户作用域存储中的写操作名称。
 */
const userWriteMethods = new Set<PropertyKey>([
  "completeMatches",
  "deleteMatches",
  "markMatchNotified",
  "saveMatch",
  "saveSettings",
  "setLastPollAt",
]);

/**
 * 创建双写存储。
 *
 * 所有读取和最终返回值都来自权威存储。镜像写入失败只进入内部观测回调，
 * 不改变用户请求的既有成功响应。
 *
 * @param {Storage} authoritative 权威存储。
 * @param {Storage} mirror 镜像目标存储。
 * @param {DualWriteStorageOptions} options 双写选项。
 * @return {Storage} 双写存储。
 */
export function createDualWriteStorage(
  authoritative: Storage,
  mirror: Storage,
  options: DualWriteStorageOptions = {},
): Storage {
  const onMirrorFailure = options.onMirrorFailure ?? logMirrorFailure;
  const storage = mirrorWrites(
    authoritative,
    mirror,
    storageWriteMethods,
    onMirrorFailure,
  );

  return new Proxy(storage, {
    /**
     * 为用户作用域存储创建独立双写包装。
     *
     * @param {Storage} target 权威存储代理。
     * @param {PropertyKey} property 读取的属性名。
     * @param {unknown} receiver 属性接收者。
     * @return {unknown} 存储属性或用户作用域双写函数。
     */
    get(target, property, receiver): unknown {
      if (property === "forUser") {
        return (userId: string): UserStorage =>
          mirrorWrites(
            authoritative.forUser(userId),
            mirror.forUser(userId),
            userWriteMethods,
            onMirrorFailure,
          );
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * 包装对象中的写方法，并保留全部读方法指向权威存储。
 *
 * @param {T} authoritative 权威对象。
 * @param {T} mirror 镜像对象。
 * @param {ReadonlySet<PropertyKey>} writeMethods 写方法名称集合。
 * @param {(failure: StorageMirrorFailure) => void} onMirrorFailure 失败回调。
 * @return {T} 双写代理对象。
 */
function mirrorWrites<T extends object>(
  authoritative: T,
  mirror: T,
  writeMethods: ReadonlySet<PropertyKey>,
  onMirrorFailure: (failure: StorageMirrorFailure) => void,
): T {
  return new Proxy(authoritative, {
    /**
     * 读取对象属性，并在需要时返回双写方法。
     *
     * @param {T} target 权威对象。
     * @param {PropertyKey} property 属性名。
     * @param {unknown} receiver 属性接收者。
     * @return {unknown} 原始属性或双写方法。
     */
    get(target, property, receiver): unknown {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (!writeMethods.has(property)) {
        return value.bind(target);
      }
      return async (...args: unknown[]): Promise<unknown> => {
        const result = await callMethod(target, property, args);
        if (!shouldMirrorResult(property, result)) {
          return result;
        }
        try {
          await callMethod(mirror, property, args);
        } catch (error) {
          onMirrorFailure({ error, method: String(property) });
        }
        return result;
      };
    },
  });
}

/**
 * 调用对象中的异步方法。
 *
 * @param {object} target 方法所属对象。
 * @param {PropertyKey} property 方法名。
 * @param {unknown[]} args 调用参数。
 * @return {Promise<unknown>} 方法结果。
 */
async function callMethod(
  target: object,
  property: PropertyKey,
  args: unknown[],
): Promise<unknown> {
  const method = Reflect.get(target, property);
  if (typeof method !== "function") {
    throw new TypeError("Storage mirror property is not callable.");
  }
  return await Reflect.apply(method, target, args);
}

/**
 * 判断权威写操作结果是否需要镜像。
 *
 * @param {PropertyKey} property 方法名。
 * @param {unknown} result 权威存储返回值。
 * @return {boolean} 是否执行镜像写入。
 */
function shouldMirrorResult(property: PropertyKey, result: unknown): boolean {
  if (property === "createAccount" || property === "updateAccount") {
    return result === true;
  }
  if (property === "consumeAuthenticationEvent") {
    return result !== undefined;
  }
  return true;
}

/**
 * 以不含敏感参数的结构化日志记录镜像失败。
 *
 * @param {StorageMirrorFailure} failure 镜像失败信息。
 */
function logMirrorFailure(failure: StorageMirrorFailure): void {
  const errorName = failure.error instanceof Error
    ? failure.error.name
    : "UnknownError";
  console.error(JSON.stringify({
    errorName,
    event: "storage_mirror_failed",
    method: failure.method,
  }));
}
