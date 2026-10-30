/**
 * @file 本文件提供以权威存储响应、向迁移目标镜像写入的双写适配器。
 */
import { mirrorAdministration } from "./administration_mirror.ts";
import type { Storage, UserStorage } from "./types.ts";
import type { WebPushStore } from "./web_push_types.ts";
import type { NativePushStore } from "./native_push_types.ts";
import type { UserSyncStore } from "./sync_types.ts";
import type { NativeNotificationStore } from "./native_notifications.ts";

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
  "saveUserAvatar",
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
     * 为用户作用域存储和浏览器订阅存储创建独立双写包装。
     *
     * @param {Storage} target 权威存储代理。
     * @param {PropertyKey} property 读取的属性名。
     * @param {unknown} receiver 属性接收者。
     * @return {unknown} 存储属性或用户作用域双写函数。
     */
    get(target, property, receiver): unknown {
      if (property === "administration" && authoritative.administration && mirror.administration) return mirrorAdministration(authoritative, mirror, onMirrorFailure);
      if (property === "webPush" && authoritative.webPush && mirror.webPush) {
        return mirrorWrites<WebPushStore>(authoritative.webPush, mirror.webPush, new Set(["save", "remove"]), onMirrorFailure);
      }
      if (property === "nativePush" && authoritative.nativePush && mirror.nativePush) {
        return mirrorWrites<NativePushStore>(authoritative.nativePush, mirror.nativePush, new Set(["save", "remove"]), onMirrorFailure);
      }
      // 短时登录交接只在权威库消费，跨库异步授权不能重新打开已消费的凭据。
      if (property === "nativeLogin") return authoritative.nativeLogin;
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
      if (property === "nativeNotifications" && value && Reflect.get(mirror, property)) {
        const inbox = value as unknown as NativeNotificationStore, replica = Reflect.get(mirror, property) as unknown as NativeNotificationStore;
        return {
          read: inbox.read.bind(inbox),
          /** @param {import("./native_notifications.ts").NativeNotification} event 新事件。 @return {Promise<import("./native_notifications.ts").NativeNotification>} 权威游标。 */
          async save(event: import("./native_notifications.ts").NativeNotification) { const saved = await inbox.save(event); try { await replica.save(saved); } catch (error) { onMirrorFailure({ error, method: "nativeNotifications.save" }); } return saved; },
        };
      }
      const sourceSync = Reflect.get(target, "sync") as UserSyncStore | undefined;
      const mirrorSync = Reflect.get(mirror, "sync") as UserSyncStore | undefined;
      if (property === "sync" && sourceSync && mirrorSync) {
        return mirrorSyncStore(sourceSync, mirrorSync, onMirrorFailure);
      }
      if (typeof value !== "function") {
        return value;
      }
      if (!writeMethods.has(property)) {
        return value.bind(target);
      }
      return async (...args: unknown[]): Promise<unknown> => {
        const result = await callMethod(target, property, args);
        if (property === "saveSettings" && sourceSync && mirrorSync) {
          try { await mirrorSync.replaceSettings(await sourceSync.readSettings()); }
          catch (error) { onMirrorFailure({ error, method: "sync.replaceSettings" }); }
          return result;
        }
        if ((property === "completeMatches" || property === "deleteMatches") && sourceSync && mirrorSync) {
          try {
            const ids = new Set(args[0] as string[]);
            for (const state of await sourceSync.readRecordStates()) if (ids.has(state.id)) await mirrorSync.replaceRecord(state);
          } catch (error) { onMirrorFailure({ error, method: "sync.replaceRecord" }); }
          return result;
        }
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
 * 同步只由权威库裁决，镜像复制已裁决的快照并保留同一版本。
 * @param {UserSyncStore} source 权威同步存储。
 * @param {UserSyncStore} mirror 镜像同步存储。
 * @param {(failure: StorageMirrorFailure) => void} onFailure 镜像故障记录器。
 * @return {UserSyncStore} 同步双写接口。
 */
function mirrorSyncStore(source: UserSyncStore, mirror: UserSyncStore, onFailure: (failure: StorageMirrorFailure) => void): UserSyncStore {
  return {
    readRecordStates: source.readRecordStates.bind(source),
    /**
     * 裁决并镜像记录状态，保留相同编辑版本。
     * @param {string} id 记录 ID。
     * @param {import("../sync/records.ts").RecordStatus} status 目标状态。
     * @param {import("../sync/protocol.ts").EditStamp} stamp 编辑版本。
     * @return {Promise<import("../sync/records.ts").RecordMerge>} 权威结果。
     */
    async applyRecord(id, status, stamp) {
      const result = await source.applyRecord(id, status, stamp);
      if (result.snapshot) {
        try { await mirror.replaceRecord(result.snapshot); }
        catch (error) { onFailure({ error, method: "sync.replaceRecord" }); }
      }
      return result;
    },
    /**
     * 刷新两端业务内容，各端保留权威同步的管理状态。
     * @param {import("../models.ts").MatchRecord} record 最新内容。
     */
    async saveRecordContent(record) {
      await source.saveRecordContent(record);
      try { await mirror.saveRecordContent(record); }
      catch (error) { onFailure({ error, method: "sync.saveRecordContent" }); }
    },
    /**
     * 安装受控管理快照并镜像。
     * @param {import("../sync/records.ts").RecordSyncSnapshot} snapshot 权威状态。
     */
    async replaceRecord(snapshot) {
      await source.replaceRecord(snapshot);
      try { await mirror.replaceRecord(snapshot); }
      catch (error) { onFailure({ error, method: "sync.replaceRecord" }); }
    },
    readSettings: source.readSettings.bind(source),
    /**
     * 裁决并镜像同一份快照，镜像故障不改变权威成功响应。
     * @param {import("../sync/settings.ts").SettingsEdit[]} edits 区域编辑。
     * @return {Promise<import("../sync/settings.ts").SettingsMerge>} 权威合并结果。
     */
    async applySettings(edits) {
      const result = await source.applySettings(edits);
      try { await mirror.replaceSettings(result.snapshot); }
      catch (error) { onFailure({ error, method: "sync.replaceSettings" }); }
      return result;
    },
    /**
     * 安装并镜像受控的权威快照。
     * @param {import("../sync/settings.ts").SettingsSyncSnapshot} snapshot 权威快照。
     */
    async replaceSettings(snapshot) {
      await source.replaceSettings(snapshot);
      try { await mirror.replaceSettings(snapshot); }
      catch (error) { onFailure({ error, method: "sync.replaceSettings" }); }
    },
  };
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
