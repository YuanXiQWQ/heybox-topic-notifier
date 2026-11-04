/** @file 在常驻进程中缓存轮询快照，并随本进程的设置、账号及轮询写入更新。 */
import type { PollScheduleEntry, Storage, UserStorage } from "./types.ts";

/** 外部进程写入的最长校准间隔；秒级到期判断仍由调度器每秒执行。 */
export const pollScheduleRefreshMs = 60_000;

/**
 * 包装常驻进程的共享存储，业务写入继续调用原存储及其事务。
 * @param {Storage} storage 权威存储。
 * @param {number} refreshMs 快照最长缓存毫秒数。
 * @param {() => number} now 单调前进的测试或运行时钟。
 * @return {Storage} 可供 HTTP 路由和后台共同使用的存储。
 */
export function cachePollSchedule(
  storage: Storage,
  refreshMs = pollScheduleRefreshMs,
  now: () => number = Date.now,
): Storage {
  if (!storage.listPollSchedule) return storage;
  let snapshot: { entries: PollScheduleEntry[]; expiresAt: number } | undefined;
  let revision = 0;
  let loading: Promise<PollScheduleEntry[]> | undefined;

  /** 使正在读取的旧快照失效，下一次调度从权威库重新读取。 */
  function invalidate(): void {
    revision++;
    snapshot = undefined;
  }

  /**
   * 合并并发读取；写入跨过查询时重新读取，防止旧响应覆盖已提交设置。
   * @return {Promise<PollScheduleEntry[]>} 独立副本，调用方修改不会污染后续调度。
   */
  async function readSchedule(): Promise<PollScheduleEntry[]> {
    if (snapshot && snapshot.expiresAt > now()) {
      return structuredClone(snapshot.entries);
    }
    loading ??= loadSchedule().finally(() => {
      loading = undefined;
    });
    return structuredClone(await loading);
  }

  /**
   * 仅缓存未被本地写入跨越的成功查询，失败保留重试能力。
   * @return {Promise<PollScheduleEntry[]>} 权威调度快照。
   */
  async function loadSchedule(): Promise<PollScheduleEntry[]> {
    for (;;) {
      const expected = revision;
      const entries = await storage.listPollSchedule!();
      if (revision !== expected) continue;
      snapshot = {
        entries: structuredClone(entries),
        expiresAt: now() + refreshMs,
      };
      return entries;
    }
  }

  /**
   * 更新已完成轮询的内存时间，避免每轮轮询后重新查询全部账号。
   * @param {string} userId 用户 ID。
   * @param {string} value 已提交的轮询完成时间。
   */
  function updateLastPoll(userId: string, value: string): void {
    revision++;
    const entry = snapshot?.entries.find((entry) => entry.userId === userId);
    if (entry) entry.lastPollAt = value;
  }

  /**
   * 拦截可影响调度的成功或不确定写入；其余方法保持原始接收者。
   * @template T 业务对象类型。
   * @param {T} target 根存储、用户存储或嵌套事务接口。
   * @param {string} userId 用户作用域。
   * @param {boolean} administration 是否为账号管理接口。
   * @return {T} 共享缓存失效规则的接口。
   */
  function wrap<T extends object>(
    target: T,
    userId: string,
    administration = false,
  ): T {
    return new Proxy(target, {
      /**
       * @param {object} object 原接口。
       * @param {string | symbol} key 成员名。
       * @return {unknown} 原成员或委托函数。
       */
      get(object, key) {
        const member = Reflect.get(object, key);
        if (key === "listPollSchedule") return readSchedule;
        if (key === "sync" && member) return wrap(member, userId);
        if (key === "administration" && member) {
          return wrap(member, userId, true);
        }
        if (key === "forUser") {
          return (id: string): UserStorage => wrap(storage.forUser(id), id);
        }
        if (typeof member !== "function") return member;
        const changesSchedule = administration ||
          [
            "saveSettings",
            "applySettings",
            "replaceSettings",
            "saveAccount",
            "createAccount",
            "updateAccount",
          ].includes(String(key));
        if (!changesSchedule && key !== "setLastPollAt") {
          return member.bind(object);
        }
        return async (...args: unknown[]) => {
          try {
            const result = await member.apply(object, args);
            if (key === "setLastPollAt") {
              updateLastPoll(userId, String(args[0]));
            } else invalidate();
            return result;
          } catch (error) {
            invalidate();
            throw error;
          }
        };
      },
    });
  }

  return wrap(storage, storage.userId ?? "default");
}
