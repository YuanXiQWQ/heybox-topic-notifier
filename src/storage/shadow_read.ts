/**
 * @file 本文件提供不改变权威响应的迁移期影子读取与一致性比较。
 */
import type { Storage, UserStorage } from "./types.ts";

/**
 * 影子读取比较结果。
 */
export type ShadowReadComparison = {
  error?: unknown;
  method: string;
  status: "error" | "match" | "mismatch";
};

/**
 * 影子读取选项。
 */
export type ShadowReadStorageOptions = {
  defer?: (task: Promise<void>) => void;
  onComparison?: (comparison: ShadowReadComparison) => void;
};

/**
 * 完整存储中需要比较的读操作。
 */
const storageReadMethods = new Set<PropertyKey>([
  "getAccountById",
  "getAccountByUsername",
  "getAppState",
  "getAuthenticationEvent",
  "getAuthIdentity",
  "getDashboardSnapshot",
  "getEmailCredential",
  "getLastPollAt",
  "getLoginFailure",
  "getPasskeyCredential",
  "getPasskeyCredentialByCredentialId",
  "getPasswordCredential",
  "getPendingEmailVerification",
  "getPendingMfaChallenge",
  "getPendingPasskeyChallenge",
  "getPendingRecoveryCodeReveal",
  "getSession",
  "getSettings",
  "getTotpCredential",
  "getUserSecuritySettings",
  "listAccounts",
  "listAuthIdentitiesForUser",
  "listEmailCredentials",
  "listHistory",
  "listPasskeyCredentials",
  "listPendingMatches",
  "listTotpCredentials",
]);

/**
 * 用户作用域存储中需要比较的读操作。
 */
const userReadMethods = new Set<PropertyKey>([
  "getAppState",
  "getDashboardSnapshot",
  "getLastPollAt",
  "getSettings",
  "listHistory",
  "listPendingMatches",
]);

/**
 * 创建影子读取存储。
 *
 * 用户请求始终等待并返回权威存储结果；影子查询通过延后任务执行，错误或差异
 * 不改变当前响应，也不会把被比较的数据写入日志。
 *
 * @param {Storage} authoritative 权威存储。
 * @param {Storage} shadow 影子读取存储。
 * @param {ShadowReadStorageOptions} options 影子读取选项。
 * @return {Storage} 影子读取包装后的存储。
 */
export function createShadowReadStorage(
  authoritative: Storage,
  shadow: Storage,
  options: ShadowReadStorageOptions = {},
): Storage {
  const onComparison = options.onComparison ?? logComparison;
  const defer = options.defer ?? deferComparison;
  const storage = shadowReads(
    authoritative,
    shadow,
    storageReadMethods,
    onComparison,
    defer,
  );
  return new Proxy(storage, {
    /**
     * 为用户作用域存储创建影子读取包装。
     *
     * @param {Storage} target 权威存储代理。
     * @param {PropertyKey} property 属性名。
     * @param {unknown} receiver 属性接收者。
     * @return {unknown} 存储属性或用户作用域包装函数。
     */
    get(target, property, receiver): unknown {
      if (property === "forUser") {
        return (userId: string): UserStorage =>
          shadowReads(
            authoritative.forUser(userId),
            shadow.forUser(userId),
            userReadMethods,
            onComparison,
            defer,
          );
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * 包装对象中的读方法并保留权威写方法。
 *
 * @param {T} authoritative 权威对象。
 * @param {T} shadow 影子对象。
 * @param {ReadonlySet<PropertyKey>} readMethods 读方法集合。
 * @param {(comparison: ShadowReadComparison) => void} onComparison 比较回调。
 * @param {(task: Promise<void>) => void} defer 延后任务函数。
 * @return {T} 影子读取代理对象。
 */
function shadowReads<T extends object>(
  authoritative: T,
  shadow: T,
  readMethods: ReadonlySet<PropertyKey>,
  onComparison: (comparison: ShadowReadComparison) => void,
  defer: (task: Promise<void>) => void,
): T {
  return new Proxy(authoritative, {
    /**
     * 读取对象属性，并在需要时返回影子读取方法。
     *
     * @param {T} target 权威对象。
     * @param {PropertyKey} property 属性名。
     * @param {unknown} receiver 属性接收者。
     * @return {unknown} 原始属性或影子读取方法。
     */
    get(target, property, receiver): unknown {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (!readMethods.has(property)) {
        return value.bind(target);
      }
      return async (...args: unknown[]): Promise<unknown> => {
        const authoritativeResult = await callMethod(target, property, args);
        defer(compareRead(
          shadow,
          property,
          args,
          authoritativeResult,
          onComparison,
        ));
        return authoritativeResult;
      };
    },
  });
}

/**
 * 执行影子读取并比较标准化结果。
 *
 * @param {object} shadow 影子对象。
 * @param {PropertyKey} property 方法名。
 * @param {unknown[]} args 调用参数。
 * @param {unknown} authoritativeResult 权威读取结果。
 * @param {(comparison: ShadowReadComparison) => void} onComparison 比较回调。
 * @return {Promise<void>} 比较完成后的 Promise。
 */
async function compareRead(
  shadow: object,
  property: PropertyKey,
  args: unknown[],
  authoritativeResult: unknown,
  onComparison: (comparison: ShadowReadComparison) => void,
): Promise<void> {
  try {
    const shadowResult = await callMethod(shadow, property, args);
    onComparison({
      method: String(property),
      status: canonicalJson(authoritativeResult) === canonicalJson(shadowResult)
        ? "match"
        : "mismatch",
    });
  } catch (error) {
    onComparison({ error, method: String(property), status: "error" });
  }
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
    throw new TypeError("Storage shadow property is not callable.");
  }
  return await Reflect.apply(method, target, args);
}

/**
 * 将值转换为键顺序稳定的 JSON。
 *
 * @param {unknown} value 原始值。
 * @return {string | undefined} 稳定 JSON。
 */
function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(canonicalValue(value));
}

/**
 * 递归排序对象键并保留数组顺序。
 *
 * @param {unknown} value 原始值。
 * @return {unknown} 可稳定序列化的值。
 */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

/**
 * 将比较任务交给 Deno Deploy 生命周期或本地微任务队列。
 *
 * @param {Promise<void>} task 比较任务。
 */
function deferComparison(task: Promise<void>): void {
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime) {
    runtime.waitUntil(task);
    return;
  }
  void task;
}

/**
 * 仅记录影子读取差异或错误，不记录被比较的数据。
 *
 * @param {ShadowReadComparison} comparison 比较结果。
 */
function logComparison(comparison: ShadowReadComparison): void {
  if (comparison.status === "match") {
    return;
  }
  const errorName = comparison.error instanceof Error
    ? comparison.error.name
    : undefined;
  console.error(JSON.stringify({
    errorName,
    event: "storage_shadow_read_difference",
    method: comparison.method,
    status: comparison.status,
  }));
}
